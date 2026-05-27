/**
 * PHASE 6A: EditManager — GPU Ring Buffer for Voxel Edits
 * 
 * Submits edit commands (carve, inject) to a GPU ring buffer.
 * Integrates into the simulation dispatch sequence before culling.
 * Zero host-GPU sync during steady state.
 */

export class EditManager {
  constructor(device, maxCommands = 1024) {
    this.device = device;
    this.maxCommands = maxCommands;
    this.nextSlot = 0;
    this.pendingCount = 0;

    // Command descriptor
    this.commandByteSize = 32; // sizeof(EditCommand) padded

    // Ring buffer for edit commands (GPU-visible)
    this.editBuffer = device.createBuffer({
      size: maxCommands * this.commandByteSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Atomic counter for number of pending commands
    this.editCountBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Shadow buffers for dynamic range expansion
    // Initialized to sentinel (0xFFFF = "use uniform meta")
    const bricks = 4096;
    const channels = 6;
    const sentinel = new Uint16Array(bricks * channels).fill(0xFFFF);

    this.editMinBuffer = device.createBuffer({
      size: sentinel.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.editMaxBuffer = device.createBuffer({
      size: sentinel.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(this.editMinBuffer, 0, sentinel);
    device.queue.writeBuffer(this.editMaxBuffer, 0, sentinel);

    this.pipeline = null;
    this.bindGroup = null;
  }

  async init(wgslSource) {
    this.pipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: this.device.createShaderModule({ code: wgslSource }),
        entryPoint: 'inject_pass',
      },
    });
  }

  /**
   * Submit an edit command to the ring buffer.
   * Called from player input handler.
   */
  submitEdit(command) {
    // command: { center: [x,y,z], radius, materialType, falloff }
    const buf = new ArrayBuffer(this.commandByteSize);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    f32[0] = command.center[0];
    f32[1] = command.center[1];
    f32[2] = command.center[2];
    f32[3] = command.radius || 2.0;
    u32[4] = command.materialType || 0; // 0=carve, 1=ore, 2=fill
    f32[5] = command.falloff ?? 0.3;

    this.device.queue.writeBuffer(
      this.editBuffer,
      this.nextSlot * this.commandByteSize,
      buf
    );

    this.nextSlot = (this.nextSlot + 1) % this.maxCommands;
    this.pendingCount++;
  }

  /**
   * Carve voxels at position with given radius.
   */
  carve(position, radius = 2.0, falloff = 0.3) {
    this.submitEdit({
      center: position,
      radius,
      materialType: 0,
      falloff,
    });
  }

  /**
   * Inject ore vein at position.
   */
  injectOre(position, radius = 1.5, falloff = 0.5) {
    this.submitEdit({
      center: position,
      radius,
      materialType: 1,
      falloff,
    });
  }

  /**
   * Fill/compaction — for structural support.
   */
  compactFill(position, radius = 2.0, falloff = 0.0) {
    this.submitEdit({
      center: position,
      radius,
      materialType: 2,
      falloff,
    });
  }

  /**
   * Build bind group for the edit pipeline.
   * Must be called with the current simulation buffers bound.
   */
  createBindGroup(metaBuffer, densityBuf, cohesionBuf, permBuf, waterBuf, brickFlagsBuf) {
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.editMinBuffer } },
        { binding: 1, resource: { buffer: this.editMaxBuffer } },
        { binding: 2, resource: { buffer: densityBuf } },
        { binding: 3, resource: { buffer: cohesionBuf } },
        { binding: 4, resource: { buffer: permBuf } },
        { binding: 5, resource: { buffer: waterBuf } },
        { binding: 6, resource: { buffer: metaBuffer } },
        { binding: 7, resource: { buffer: brickFlagsBuf } },
        { binding: 8, resource: { buffer: this.editBuffer } },
        { binding: 9, resource: { buffer: this.editCountBuffer } },
      ],
    });
  }

  /**
   * Apply pending edits. Must be called BEFORE the culling pass.
   * Returns command encoder with the edit pass added.
   */
  applyEdits(encoder) {
    if (this.pendingCount === 0) return;

    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);

    // Dispatch: ceil(pendingCount/64) × ceil(4096/64) × 1
    const wgX = Math.ceil(this.pendingCount / 64);
    const wgY = Math.ceil(4096 / 64);
    pass.dispatchWorkgroups(wgX, wgY, 1);
    pass.end();

    // Reset counter for next frame
    this.device.queue.writeBuffer(this.editCountBuffer, 0, new Uint32Array([0]));
    this.pendingCount = 0;
  }

  /**
   * Periodically compact shadow buffers back into uniform brick_meta.
   * Optional — for indefinitely expanding ranges.
   * Should be called every N frames where N is large (hundreds).
   */
  async compactShadowBuffers(metaBuffer) {
    // Read back current edit_min/max
    const readMin = this.device.createBuffer({
      size: this.editMinBuffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const readMax = this.device.createBuffer({
      size: this.editMaxBuffer.size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.editMinBuffer, 0, readMin, 0, this.editMinBuffer.size);
    encoder.copyBufferToBuffer(this.editMaxBuffer, 0, readMax, 0, this.editMaxBuffer.size);
    this.device.queue.submit([encoder.finish()]);

    await readMin.mapAsync(GPUMapMode.READ);
    await readMax.mapAsync(GPUMapMode.READ);

    const minData = new Float32Array(readMin.getMappedRange().slice());
    const maxData = new Float32Array(readMax.getMappedRange().slice());

    readMin.unmap();
    readMax.unmap();
    readMin.destroy();
    readMax.destroy();

    // Detect bricks where edit_min/max are tighter than the uniform
    // Build a new uniform metadata buffer
    const bricks = 4096;
    const channels = 6;
    const newMeta = new Float32Array(bricks * channels * 4);

    for (let b = 0; b < bricks; b++) {
      for (let c = 0; c < channels; c++) {
        const idx = b * channels * 4 + c * 4;
        const editMin = minData[b * channels + c];
        const editMax = maxData[b * channels + c];
        const isSentinel = (new Uint16Array([editMin])[0] & 0x7FFF) === 0x7FFF;
        // NOTE: f16 sentinel check only works reliably via bit pattern.
        // In production, encode the sentinel as NaN and check isnan().

        if (!isSentinel) {
          newMeta[idx] = editMin;
          newMeta[idx + 1] = editMax - editMin;
        }
        // else: keep existing uniform values (written at init)
      }
    }

    this.device.queue.writeBuffer(metaBuffer, 0, newMeta);

    // Reset shadow buffers to sentinel
    const sentinel = new Uint16Array(bricks * channels).fill(0xFFFF);
    this.device.queue.writeBuffer(this.editMinBuffer, 0, sentinel);
    this.device.queue.writeBuffer(this.editMaxBuffer, 0, sentinel);
  }

  destroy() {
    const bufs = ['editBuffer', 'editCountBuffer', 'editMinBuffer', 'editMaxBuffer'];
    for (const key of bufs) {
      if (this[key]) this[key].destroy();
    }
  }
}
