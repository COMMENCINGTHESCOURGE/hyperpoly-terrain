// =============================================================================
// Phase 1: Two-Pass Dispatch Host — HYPERPOLY Hydraulic Solver
// =============================================================================
// Pass 1: Culling compute — reads brick_metadata, writes indirect dispatch buffer
// Pass 2: Solver compute — indirect dispatch from Pass 1 output
//
// Architecture:
//   Browser owns the runtime (WGSL shader + this host).
//   Kaggle owns the truth (material tensor calibration).
//   The WGSL shader and WASM fallback are both compiled artifacts from
//   the same hydraulic solver logic — this host loads WGSL; a Kaggle
//   notebook produces the WASM fallback separately.
// =============================================================================

const WORLD_DIM   = 256;
const BRICK_DIM   = 8;
const BRICKS_X    = WORLD_DIM / BRICK_DIM;  // 32
const BRICKS_Y    = WORLD_DIM / BRICK_DIM;  // 32
const LAYERS_PER_DISPATCH = 4;
const BRICKS_Z_DISPATCH = WORLD_DIM / LAYERS_PER_DISPATCH;  // 64

const TOTAL_VOXELS       = WORLD_DIM * WORLD_DIM * WORLD_DIM;           // 16,777,216
const TOTAL_BRICK_SLICES = BRICKS_X * BRICKS_Y * BRICKS_Z_DISPATCH;    // 65,536
const MAX_ACTIVE_BRICKS  = TOTAL_BRICK_SLICES;

const BUDGET_MAX_DEFAULT = 3000;

// =============================================================================
// GPU Resource Manager
// =============================================================================

export class HydraulicPipeline {
    constructor(device, budgetMax = BUDGET_MAX_DEFAULT) {
        this.device = device;
        this.budgetMax = budgetMax;

        // --- SoA Voxel Buffers ---
        // f16 = 2 bytes/elem; vec3<f16> = 6 bytes/elem
        this.voxelWater    = this._createStorage(TOTAL_VOXELS * 2);
        this.voxelSediment = this._createStorage(TOTAL_VOXELS * 2);
        this.voxelPerm     = this._createStorage(TOTAL_VOXELS * 6);
        this.voxelCohesion = this._createStorage(TOTAL_VOXELS * 2);

        // --- Brick Metadata (1 u32 per 8×8×4 dispatch slice) ---
        this.brickMetadata = this._createStorage(TOTAL_BRICK_SLICES * 4);

        // --- Dispatch Chain Buffers ---
        // Indirect dispatch: 3 × u32 = 12 bytes, requires INDIRECT usage
        this.indirectBuffer = device.createBuffer({
            size: 12,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
        });

        // Active list: ActiveBrick = 16 bytes (u32 + 12-byte vec3<u32>)
        this.activeList = this._createStorage(MAX_ACTIVE_BRICKS * 16);

        // Budget counter — reset per frame by CPU write
        this.budgetCounter = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        // Uniform buffer: total_bricks + dimensions + budget_max
        this._uniformData = new Uint32Array([
            TOTAL_BRICK_SLICES,  // total_bricks
            BRICKS_X,
            BRICKS_Y,
            WORLD_DIM,
            budgetMax,
        ]);
        this.uniformBuffer = device.createBuffer({
            size: 5 * 4,  // 5 × u32
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.uniformBuffer, 0, this._uniformData);

        // Pre-allocated zero buffer for resetting indirect dispatch state
        this._dispatchInit = new Uint32Array([0, 1, 1]);  // x=0, y=1, z=1
    }

    // ==========================================================================
    // Initialization — must be called after WGSL sources are fetched
    // ==========================================================================

    async init(pass1WGSL, pass2WGSL) {
        const device = this.device;

        const pass1Module = device.createShaderModule({ code: pass1WGSL });
        const pass2Module = device.createShaderModule({ code: pass2WGSL });

        this.pass1Pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: pass1Module, entryPoint: 'cull_active_bricks' },
        });

        this.pass2Pipeline = device.createComputePipeline({
            layout: 'auto',
            compute: { module: pass2Module, entryPoint: 'hydraulic_solver' },
        });

        // --- Pass 1 Bind Group ---
        this.pass1BindGroup = device.createBindGroup({
            layout: this.pass1Pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.brickMetadata }},
                { binding: 1, resource: { buffer: this.indirectBuffer }},
                { binding: 2, resource: { buffer: this.activeList     }},
                { binding: 3, resource: { buffer: this.budgetCounter  }},
            ],
        });

        // --- Pass 2 Bind Groups ---
        this.pass2BindGroup0 = device.createBindGroup({
            layout: this.pass2Pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.voxelWater    }},
                { binding: 1, resource: { buffer: this.voxelSediment }},
                { binding: 2, resource: { buffer: this.voxelPerm     }},
                { binding: 3, resource: { buffer: this.voxelCohesion }},
                { binding: 4, resource: { buffer: this.brickMetadata }},
            ],
        });

        this.pass2BindGroup1 = device.createBindGroup({
            layout: this.pass2Pipeline.getBindGroupLayout(1),
            entries: [
                { binding: 0, resource: { buffer: this.activeList     }},
                { binding: 1, resource: { buffer: this.indirectBuffer }},
            ],
        });

        this.pass2BindGroup2 = device.createBindGroup({
            layout: this.pass2Pipeline.getBindGroupLayout(2),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer }},
            ],
        });
    }

    // ==========================================================================
    // Upload initial world state from material tensor (Kaggle output or procedural)
    // ==========================================================================

    uploadInitialState({ water, sediment, permeability, cohesion, metadata }) {
        const q = this.device.queue;
        q.writeBuffer(this.voxelWater,    0, water);
        q.writeBuffer(this.voxelSediment, 0, sediment);
        q.writeBuffer(this.voxelPerm,     0, permeability);
        q.writeBuffer(this.voxelCohesion, 0, cohesion);
        q.writeBuffer(this.brickMetadata, 0, metadata);
    }

    // ==========================================================================
    // One simulation step (call per frame)
    // ==========================================================================

    step() {
        const device = this.device;
        const queue  = device.queue;

        // Reset indirect buffer atomically: x=0, y=1, z=1 (single write, no window)
        queue.writeBuffer(this.indirectBuffer, 0, this._dispatchInit);

        // Reset budget counter for this frame
        queue.writeBuffer(this.budgetCounter, 0, new Uint32Array([0]));

        const cmd = device.createCommandEncoder();

        // ========================================================================
        // Pass 1: Culling — determine which bricks are active
        // ========================================================================
        {
            const pass = cmd.beginComputePass();
            pass.setPipeline(this.pass1Pipeline);
            pass.setBindGroup(0, this.pass1BindGroup);
            pass.setBindGroup(1, this._cullingUniformBindGroup);

            const workgroups = Math.ceil(TOTAL_BRICK_SLICES / 64);
            pass.dispatchWorkgroups(workgroups, 1, 1);
            pass.end();
        }

        // ========================================================================
        // Pass 2: Hydraulic solver — only dispatched bricks run
        // ========================================================================
        {
            const pass = cmd.beginComputePass();
            pass.setPipeline(this.pass2Pipeline);
            pass.setBindGroup(0, this.pass2BindGroup0);
            pass.setBindGroup(1, this.pass2BindGroup1);
            pass.setBindGroup(2, this.pass2BindGroup2);

            // GPU driver reads indirectBuffer.x → dispatches exactly that many
            pass.dispatchWorkgroupsIndirect(this.indirectBuffer, 0);
            pass.end();
        }

        queue.submit([cmd.finish()]);
    }

    // ==========================================================================
    // Readback dispatch count for Phase 1 validation
    // ==========================================================================

    async readDispatchCount() {
        const staging = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const cmd = this.device.createCommandEncoder();
        cmd.copyBufferToBuffer(this.indirectBuffer, 0, staging, 0, 4);
        this.device.queue.submit([cmd.finish()]);
        await staging.mapAsync(GPUMapMode.READ);
        const count = new Uint32Array(staging.getMappedRegion())[0];
        staging.destroy();
        return count;
    }

    // ==========================================================================
    // Update budget uniform (no kernel recompile needed)
    // ==========================================================================

    setBudgetMax(newBudget) {
        this.budgetMax = newBudget;
        this._uniformData[4] = newBudget;
        this.device.queue.writeBuffer(this.uniformBuffer, 0, this._uniformData);
    }

    // ==========================================================================
    // Internal
    // ==========================================================================

    _createStorage(size) {
        return this.device.createBuffer({
            size,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }

    // Culling uniform bind group (reused)
    get _cullingUniformBindGroup() {
        if (!this.__cullingBG) {
            this.__cullingBG = this.device.createBindGroup({
                layout: this.pass1Pipeline.getBindGroupLayout(1),
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer }},
                ],
            });
        }
        return this.__cullingBG;
    }
}

// =============================================================================
// Bootstrap helper — loads WGSL sources and initializes the pipeline
// =============================================================================

export async function createHydraulicPipeline(device, budgetMax) {
    const pass1WGSL = await fetch('compute/pass1_culling.wgsl').then(r => r.text());
    const pass2WGSL = await fetch('compute/pass2_solver.wgsl').then(r => r.text());

    const pipeline = new HydraulicPipeline(device, budgetMax);
    await pipeline.init(pass1WGSL, pass2WGSL);
    return pipeline;
}
