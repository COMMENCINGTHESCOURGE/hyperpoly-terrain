/**
 * PHASE 5: GPU Indirect Draw Pipeline
 * 
 * Wires topology generation + LOD stitching + indirect draw.
 * Supports full mesh build and delta updates.
 */

export class Phase5Draw {
  constructor(device) {
    this.device = device;

    // Max 6 indices per cell × 255³ cells × 4 bytes = ~400MB worst-case
    // In production: allocate based on expected face-crossing density (~30% of cells)
    this.maxIndices = 255 * 255 * 255 * 6;
    this.indexBuffer = device.createBuffer({
      size: this.maxIndices * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });

    // Index count (written by topology pass, read by draw)
    this.indexCountBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    // Indirect draw args: [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
    this.drawArgsBuffer = device.createBuffer({
      size: 20,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.INDIRECT,
    });

    // Staging for readback
    this.readbackBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    this.pipelines = {};
    this._bindGroupCache = {};
  }

  async init(wgslSources) {
    const device = this.device;

    this.pipelines.topology = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: wgslSources.topology }),
        entryPoint: 'topology_pass',
      },
    });

    this.pipelines.stitch = device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: device.createShaderModule({ code: wgslSources.stitch }),
        entryPoint: 'stitch_pass',
      },
    });
  }

  _createTopologyBG(qefBuffer, hermiteBuffer, isoThreshold) {
    return this.device.createBindGroup({
      layout: this.pipelines.topology.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: qefBuffer } },
        { binding: 1, resource: { buffer: hermiteBuffer } },
        { binding: 2, resource: { buffer: this.indexBuffer } },
        { binding: 3, resource: { buffer: this.indexCountBuffer } },
        { binding: 4, resource: { buffer: isoThreshold } },
      ],
    });
  }

  _createStitchBG(qefBuffer, lodBuffer) {
    return this.device.createBindGroup({
      layout: this.pipelines.stitch.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: qefBuffer } },
        { binding: 1, resource: { buffer: lodBuffer } },
      ],
    });
  }

  /**
   * Full mesh build: topology generation + LOD stitching + draw args.
   */
  async buildMesh(qefBuffer, hermiteBuffer, lodBuffer, isoThresholdValue) {
    const device = this.device;
    const encoder = device.createCommandEncoder();

    // Reset index count
    device.queue.writeBuffer(this.indexCountBuffer, 0, new Uint32Array([0]));

    // --- Pass 1: Topology generation ---
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.topology);
      pass.setBindGroup(0, this._createTopologyBG(qefBuffer, hermiteBuffer, isoThresholdValue));
      pass.dispatchWorkgroups(32, 32, 1);  // 255 × 255 cells in XY
      pass.end();
    }

    // --- Pass 2: LOD stitching ---
    {
      const pass = encoder.beginComputePass();
      pass.setPipeline(this.pipelines.stitch);
      pass.setBindGroup(0, this._createStitchBG(qefBuffer, lodBuffer));
      pass.dispatchWorkgroups(32, 32, 32);  // 255³ cells
      pass.end();
    }

    // --- Update indirect draw args ---
    // copy indexCount → drawArgs[0] (indexCount)
    encoder.copyBufferToBuffer(this.indexCountBuffer, 0, this.drawArgsBuffer, 0, 4);
    // Set instanceCount = 1 (at offset 4)
    // In a separate writeBuffer:
    device.queue.writeBuffer(this.drawArgsBuffer, 4, new Uint32Array([1, 0, 0, 0]));

    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();

    return true;
  }

  /**
   * Read current index count for validation.
   */
  async readIndexCount() {
    const encoder = this.device.createCommandEncoder();
    encoder.copyBufferToBuffer(this.indexCountBuffer, 0, this.readbackBuffer, 0, 4);
    this.device.queue.submit([encoder.finish()]);

    await this.readbackBuffer.mapAsync(GPUMapMode.READ);
    const count = new Uint32Array(this.readbackBuffer.getMappedRange())[0];
    this.readbackBuffer.unmap();
    return count;
  }

  /**
   * Bind pipeline for rendering.
   * Call within a render pass.
   */
  bind(renderPass, vertexBuffer, materialBindGroup) {
    renderPass.setIndexBuffer(this.indexBuffer, 'uint32');
    renderPass.setVertexBuffer(0, vertexBuffer);
    renderPass.setBindGroup(0, materialBindGroup);
    renderPass.drawIndirect(this.drawArgsBuffer, 0);
  }

  destroy() {
    const bufs = ['indexBuffer', 'indexCountBuffer', 'drawArgsBuffer', 'readbackBuffer'];
    for (const key of bufs) {
      if (this[key]) this[key].destroy();
    }
  }
}
