/**
 * PHASE 5: Material-Driven Mesh Extraction Host
 * 
 * Wires hermite → qef → lod → delta passes.
 * Reads 6-channel quantized material tensor.
 * Writes GPU-visible dual vertex buffer for rendering.
 */

export class Phase5Extractor {
  constructor(device, gridSize = 256) {
    this.device = device;
    this.gridSize = gridSize;
    this.cellCount = (gridSize - 1) ** 3;    // 255³
    this.vertexCount = (gridSize + 1) ** 3;   // 257³

    this._createBuffers();
    this.pipelines = {};
  }

  _createBuffers() {
    // Hermite data: 257³ × (3+3+1) f32 = 257³ × 28 bytes ≈ 475MB
    // In production: allocate as staging, compress for GPU-copy
    this.hermiteBuffer = this.device.createBuffer({
      size: this.vertexCount * 28,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Dual vertex buffer: 255³ × vec3<f32> = 255³ × 12 bytes ≈ 199MB
    this.vertexBuffer = this.device.createBuffer({
      size: this.cellCount * 12,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_SRC,
    });

    this.prevVertexBuffer = this.device.createBuffer({
      size: this.cellCount * 12,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // LOD flags: 255³ × u32 = ~66MB (compress to 2 bits per cell in production)
    this.lodBuffer = this.device.createBuffer({
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Delta buffer: max 100K deltas per frame
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
  }

  async init(wgslSources) {
    const device = this.device;

    // Pipe 1: Hermite data generation
    this.pipelines.hermite = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.hermite }), entryPoint: 'hermite_pass' },
    });

    // Pipe 2: QEF solve
    this.pipelines.qef = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.qef }), entryPoint: 'qef_solve' },
    });

    // Pipe 3: LOD computation
    this.pipelines.lod = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.lod }), entryPoint: 'lod_compute' },
    });

    // Pipe 4: Delta streaming
    this.pipelines.delta = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: wgslSources.delta }), entryPoint: 'delta_compute' },
    });

    // Store bind group layouts for dynamic binding
    this._bindGroupCache = {};
  }

  _createHermiteBG(metaBuffer, densityBuf, cohesionBuf, permXBuf) {
    return this.device.createBindGroup({
      layout: this.pipelines.hermite.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: metaBuffer } },
        { binding: 1, resource: { buffer: densityBuf } },
        { binding: 2, resource: { buffer: cohesionBuf } },
        { binding: 3, resource: { buffer: permXBuf } },
        { binding: 4, resource: { buffer: this.hermiteBuffer } },
      ],
    });
  }

  _createQEFBG() {
    return this.device.createBindGroup({
      layout: this.pipelines.qef.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.hermiteBuffer } },
        { binding: 1, resource: { buffer: this.vertexBuffer } },
        { binding: 2, resource: { buffer: this.qefParamsBuffer } },
      ],
    });
  }

  _createLODBG(metaBuffer, cohesionBuf, permXBuf) {
    return this.device.createBindGroup({
      layout: this.pipelines.lod.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: cohesionBuf } },
        { binding: 1, resource: { buffer: permXBuf } },
        { binding: 2, resource: { buffer: this.lodBuffer } },
        { binding: 3, resource: { buffer: metaBuffer } },
      ],
    });
  }

  _createDeltaBG(brickMetaBuffer) {
    return this.device.createBindGroup({
      layout: this.pipelines.delta.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: brickMetaBuffer } },
        { binding: 1, resource: { buffer: this.prevVertexBuffer } },
        { binding: 2, resource: { buffer: this.vertexBuffer } },
        { binding: 3, resource: { buffer: this.deltaBuffer } },
        { binding: 4, resource: { buffer: this.deltaCountBuffer } },
      ],
    });
  }

  async fullExtract(metaBuffer, channelBuffers, brickMetaBuffer) {
    const device = this.device;
    const encoder = device.createCommandEncoder();

    // Set QEF params
    device.queue.writeBuffer(this.qefParamsBuffer, 0, new Float32Array([0.3, 0.01]));

    // Pass 1: Hermite data generation (32×32×32 workgroups = 256³ vertices)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.hermite);
      pass.setBindGroup(0, this._createHermiteBG(metaBuffer,
        channelBuffers[0], channelBuffers[5], channelBuffers[2]));
      pass.dispatchWorkgroups(32, 32, 32);
      pass.end();
    }

    // Pass 2: QEF solve (32×32×32 workgroups = 255³ cells)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.qef);
      pass.setBindGroup(0, this._createQEFBG());
      pass.dispatchWorkgroups(32, 32, 32);
      pass.end();
    }

    // Pass 3: LOD computation (32×32×32 workgroups = 255³ cells)
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.lod);
      pass.setBindGroup(0, this._createLODBG(metaBuffer, channelBuffers[5], channelBuffers[2]));
      pass.dispatchWorkgroups(32, 32, 32);
      pass.end();
    }

    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    // Copy vertex buffer to previous for next frame's delta
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(this.vertexBuffer, 0, this.prevVertexBuffer, 0, this.cellCount * 12);
    device.queue.submit([copyEncoder.finish()]);
  }

  async incrementalExtract(brickMetaBuffer) {
    const device = this.device;
    const encoder = device.createCommandEncoder();

    // Reset delta counter
    device.queue.writeBuffer(this.deltaCountBuffer, 0, new Uint32Array([0]));

    // Pass: Delta computation
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipelines.delta);
    pass.setBindGroup(0, this._createDeltaBG(brickMetaBuffer));
    pass.dispatchWorkgroups(64, 1, 1);  // 64 WGs × 64 threads = 4096 bricks
    pass.end();

    device.queue.submit([encoder.finish()]);

    // Read back delta count for renderer
    const readback = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const readEncoder = device.createCommandEncoder();
    readEncoder.copyBufferToBuffer(this.deltaCountBuffer, 0, readback, 0, 4);
    device.queue.submit([readEncoder.finish()]);

    await readback.mapAsync(GPUMapMode.READ);
    const count = new Uint32Array(readback.getMappedRange())[0];
    readback.unmap();
    readback.destroy();

    // Update previous vertex buffer for next frame
    const copyEncoder = device.createCommandEncoder();
    copyEncoder.copyBufferToBuffer(this.vertexBuffer, 0, this.prevVertexBuffer, 0, this.cellCount * 12);
    device.queue.submit([copyEncoder.finish()]);

    return count;
  }

  getVertexBuffer() {
    return this.vertexBuffer;
  }

  getLODBuffer() {
    return this.lodBuffer;
  }

  destroy() {
    const bufs = ['hermiteBuffer', 'vertexBuffer', 'prevVertexBuffer',
      'lodBuffer', 'deltaBuffer', 'deltaCountBuffer', 'qefParamsBuffer'];
    for (const key of bufs) {
      if (this[key]) this[key].destroy();
    }
  }
}
