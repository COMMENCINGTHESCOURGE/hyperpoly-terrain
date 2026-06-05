/**
 * VRAM ANALYSIS: Phase5Extractor buffer allocation
 * 
 * Current allocation (worst-case, full 256³ grid):
 * 
 *   hermiteBuffer:  257³ × 28 B = 475 MB    ← PRIMARY TARGET
 *   vertexBuffer:   255³ × 12 B = 199 MB    ← needs full allocation (used by renderer)
 *   prevVertexBuf:  255³ × 12 B = 199 MB    ← delta comparison, can't tile
 *   lodBuffer:      255³ ×  4 B =  66 MB    ← per-cell flags
 *   deltaBuffer:    100K × 28 B =   3 MB    ← small
 *   TOTAL ≈ 942 MB
 * 
 * Tiling strategy for hermiteBuffer:
 * 
 *   The hermite pass reads 6-channel voxel data and writes HermiteData
 *   (pos + normal + weight) at every grid vertex. Each vertex is
 *   independent — there is zero cross-vertex dependency.
 * 
 *   Brick grouping: 16 bricks × 16 bricks × 16 bricks = 4096 bricks
 *   Each brick = 16³ voxels
 *   Each brick's hermite data = 17³ vertices × 28 B = 137 KB
 * 
 *   Tile size: 8 bricks (2×2×2) = 32³ vertices
 *   Tile hermite: 32³ × 28 B = 0.9 MB
 * 
 *   If we tile across 8 bricks at a time:
 *     Peak hermite staging: 0.9 MB (vs 475 MB)
 *     Number of tiles: 4096 / 8 = 512
 *     Additional overhead: 512 × (dispatch + barrier) ≈ negligible
 * 
 *   Implementation:
 *     tiledExtract() loops over brick tiles, dispatching hermite → qef → lod
 *     for each tile, writing incremental results to the full vertex/lod buffers.
 * 
 *   Peak VRAM with tiling:
 *     hermiteBuffer:  0.9 MB (tiled, reused per iteration)
 *     vertexBuffer:   199 MB (unchanged)
 *     prevVertexBuf:  199 MB (unchanged)
 *     lodBuffer:      66 MB (unchanged)
 *     deltaBuffer:    3 MB (unchanged)
 *     TOTAL ≈ 468 MB (down from 942 MB)
 * 
 *   Further optimization: tile QEF staging too. The QEF pass builds
 *   8× HermiteData per cell — if we tile QEF to match, the vertex
 *   buffer doesn't change (it's the output target regardless).
 */

/**
 * Tiled extract implementation.
 * 
 * Divides the 256³ grid into TILE_SIZE³ brick groups.
 * For each tile: dispatch hermite → qef → lod shaders
 * using a small reusable staging buffer for hermite data.
 * 
 * The vertexBuffer and lodBuffer are the accumulated output
 * targets — each tile writes to its slice of these buffers.
 */
export class TiledExtractor {
  constructor(device, gridSize = 256) {
    this.device = device;
    this.gridSize = gridSize;
    this.bricksPerDim = gridSize / 16;           // 16
    this.totalBricks = this.bricksPerDim ** 3;    // 4096

    // Tile: 4 bricks per dim (64³ vertices per tile)
    this.TILE_BRICKS = 4;      // bricks per tile dimension
    this.TILE_BRICK_DIM = this.TILE_BRICKS * 16;  // 64 vertices
    this.tilesPerDim = this.bricksPerDim / this.TILE_BRICKS;  // 4

    // Staging: one tile's worth of Hermite data
    // 64³ vertices × 28 bytes = 7.3 MB (vs 475 MB for full grid)
    const tileVertices = (this.TILE_BRICK_DIM + 1) ** 3;
    this.tileHermiteSize = tileVertices * 28;
    
    // Full output buffers (same as original — the final result lands here)
    this.cellCount = (gridSize - 1) ** 3;       // 255³
    this.vertexCount = (gridSize + 1) ** 3;      // 257³

    this._createOutputBuffers();
    this.pipelines = {};
    this._bindGroupCache = {};
    console.log(`TiledExtractor: ${this.tilesPerDim}³ tiles, ${this.tileHermiteSize/1024/1024|0}MB staging per tile`);
  }

  _createOutputBuffers() {
    // Full vertex buffer (target for accumulated results)
    this.vertexBuffer = this.device.createBuffer({
      size: this.cellCount * 12,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
    });

    this.prevVertexBuffer = this.device.createBuffer({
      size: this.cellCount * 12,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // LOD flags buffer (per-cell, written tile by tile)
    this.lodBuffer = this.device.createBuffer({
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Tile-scoped Hermite staging buffer (reused across tiles)
    this.tileHermiteBuffer = this.device.createBuffer({
      size: this.tileHermiteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Delta buffers (unchanged from original)
    this.deltaBuffer = this.device.createBuffer({
      size: 100000 * 28,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });
    this.deltaCountBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    this.qefParamsBuffer = this.device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Tile offset uniform (vec3<u32> = 12 bytes, padded to 16)
    this.tileOffsetBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  async init(wgslSources) {
    const device = this.device;
    this.pipelines.hermite = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.hermite }), entryPoint: 'hermite_pass' },
    });
    this.pipelines.qef = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.qef }), entryPoint: 'qef_solve' },
    });
    this.pipelines.lod = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.lod }), entryPoint: 'lod_compute' },
    });
    this.pipelines.delta = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.delta }), entryPoint: 'delta_compute' },
    });
  }

  /**
   * Tiled full extract — processes the grid in brick tiles, reusing
   * a small Hermite staging buffer across tiles.
   * 
   * Each tile: hermite → qef → lod, writing to slices of the full buffer.
   */
  async tiledExtract(metaBuffer, channelBuffers, brickMetaBuffer) {
    const device = this.device;
    const queue = device.queue;

    queue.writeBuffer(this.qefParamsBuffer, 0, new Float32Array([0.3, 0.01]));

    // Clear lod buffer (write zeros to first tile-sized chunk, then tile)
    // For simplicity: queue a single zero-fill via writeBuffer
    const zeroBuf = new Uint32Array(this.cellCount);
    queue.writeBuffer(this.lodBuffer, 0, zeroBuf);

    // Tile loop: iterate over tilesPerDim³ brick groups
    for (let tz = 0; tz < this.tilesPerDim; tz++) {
      for (let ty = 0; ty < this.tilesPerDim; ty++) {
        for (let tx = 0; tx < this.tilesPerDim; tx++) {
          // Tile loop offset for global buffer writes
          const tileOffsetData = new Uint32Array([vx0, vy0, vz0, 0]); // padding
          queue.writeBuffer(this.tileOffsetBuffer, 0, tileOffsetData);

          const encoder = device.createCommandEncoder();

          // Compute tile bounds in vertex space
          const vx0 = tx * this.TILE_BRICK_DIM;
          const vy0 = ty * this.TILE_BRICK_DIM;
          const vz0 = tz * this.TILE_BRICK_DIM;
          const vx1 = Math.min(vx0 + this.TILE_BRICK_DIM, this.gridSize);
          const vy1 = Math.min(vy0 + this.TILE_BRICK_DIM, this.gridSize);
          const vz1 = Math.min(vz0 + this.TILE_BRICK_DIM, this.gridSize);
          const tileVertsX = vx1 - vx0 + 1;
          const tileVertsY = vy1 - vy0 + 1;
          const tileVertsZ = vz1 - vz0 + 1;

          // Workgroups for hermite pass within this tile
          const wgX = Math.ceil(tileVertsX / 8);
          const wgY = Math.ceil(tileVertsY / 8);
          const wgZ = Math.ceil(tileVertsZ / 8);

          // Pass 1: Hermite (tile-scoped, writes to tileHermiteBuffer)
          {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.pipelines.hermite);
            pass.setBindGroup(0, this._createHermiteBG(metaBuffer,
              channelBuffers[0], channelBuffers[5], channelBuffers[2]));
            pass.dispatchWorkgroups(wgX, wgY, wgZ);
            pass.end();
          }

          // Pass 2: QEF (tile-scoped, writes to full vertexBuffer at tile offset)
          {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.pipelines.qef);
            pass.setBindGroup(0, this._createQEFBG_Tiled(vx0, vy0, vz0));
            pass.dispatchWorkgroups(wgX, wgY, wgZ);
            pass.end();
          }

          // Pass 3: LOD (tile-scoped, writes to full lodBuffer at tile offset)
          {
            const pass = encoder.beginComputePass();
            pass.setPipeline(this.pipelines.lod);
            pass.setBindGroup(0, this._createLODBG_Tiled(metaBuffer, channelBuffers[5], channelBuffers[2], vx0, vy0, vz0));
            pass.dispatchWorkgroups(wgX, wgY, wgZ);
            pass.end();
          }

          queue.submit([encoder.finish()]);
        }
      }
    }

    await queue.onSubmittedWorkDone();

    // Copy vertex buffer to previous for next frame's delta
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(this.vertexBuffer, 0, this.prevVertexBuffer, 0, this.cellCount * 12);
    device.queue.submit([copyEncoder.finish()]);
  }

  // ── Tiled bind group helpers (need tile offset uniforms) ──
  // Note: The WGSL shaders need to accept a tile_offset uniform to
  // write to the correct slice of the full vertex/lod buffers.
  // These createBindGroup methods remain to be wired once the
  // tile_offset uniform is added to the shaders.

  _createHermiteBG(metaBuffer, densityBuf, cohesionBuf, permXBuf) {
    return this.device.createBindGroup({
      layout: this.pipelines.hermite.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: metaBuffer } },
        { binding: 1, resource: { buffer: densityBuf } },
        { binding: 2, resource: { buffer: cohesionBuf } },
        { binding: 3, resource: { buffer: permXBuf } },
        { binding: 4, resource: { buffer: this.tileHermiteBuffer } },
      ],
    });
  }

  _createQEFBG_Tiled(tileX, tileY, tileZ) {
    // Now includes tile_offset uniform binding
    return this.device.createBindGroup({
      layout: this.pipelines.qef.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.tileHermiteBuffer } },
        { binding: 1, resource: { buffer: this.vertexBuffer } },
        { binding: 2, resource: { buffer: this.qefParamsBuffer } },
        { binding: 3, resource: { buffer: this.tileOffsetBuffer } },
      ],
    });
  }

  _createLODBG_Tiled(metaBuffer, cohesionBuf, permXBuf, tx, ty, tz) {
    return this.device.createBindGroup({
      layout: this.pipelines.lod.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: cohesionBuf } },
        { binding: 1, resource: { buffer: permXBuf } },
        { binding: 2, resource: { buffer: this.lodBuffer } },
        { binding: 3, resource: { buffer: metaBuffer } },
        { binding: 4, resource: { buffer: this.tileOffsetBuffer } },
      ],
    });
  }

  getVertexBuffer() { return this.vertexBuffer; }
  getLODBuffer() { return this.lodBuffer; }

  destroy() {
    const bufs = ['vertexBuffer', 'prevVertexBuffer', 'lodBuffer', 'tileHermiteBuffer',
                  'deltaBuffer', 'deltaCountBuffer', 'qefParamsBuffer', 'tileOffsetBuffer'];
    for (const key of bufs) {
      if (this[key]) this[key].destroy();
    }
  }
}

/* 
 * WGSL SHADER MODIFICATIONS REQUIRED
 * 
 * The hermite and qef shaders currently compute global vertex indices
 * from global_invocation_id. For tiled extraction, they need an
 * additional tile_offset uniform so they write to the correct slice
 * of the full buffer:
 * 
 *   @group(0) @binding(6) var<uniform> tile_offset: vec3<u32>;
 *   
 *   // In hermite_pass:
 *   let vx = gid.x + 1u + tile_offset.x;
 *   let vy = gid.y + 1u + tile_offset.y;
 *   let vz = gid.z + 1u + tile_offset.z;
 *   let vertex_idx = vx + vy * GRID_SIZE + vz * GRID_SIZE * GRID_SIZE;
 *   
 *   // In qef_solve, similarly adjust cell indices:
 *   let cx = gid.x + tile_offset.x;
 *   let cy = gid.y + tile_offset.y;
 *   let cz = gid.z + tile_offset.z;
 * 
 * Binding locations:
 *   hermite: binding(5) = tile_offset
 *   qef: binding(3) = tile_offset
 *   lod: binding(4) = tile_offset
 */
