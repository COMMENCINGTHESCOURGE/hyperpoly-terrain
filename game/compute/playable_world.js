/**
 * PLAYABLE WORLD — The glue that wires input, UI, audio to the engine
 * ~50 lines. A single class that makes the metabolism playable.
 */

import { HyperPolyGeology } from './hyperpoly_geology.js';
import { MinimalInput } from './minimal_input.js';
import { MinimalUI } from './minimal_ui.js';
import { MinimalAudio } from './minimal_audio.js';
import { EditManager } from './phase6_edit/phase6_host.js';
import { Phase5Extractor } from './phase5_extractor/phase5_host.js';
import { Phase5Draw } from './phase5_extractor/phase5_draw.js';

export class PlayableWorld {
  constructor(canvas, device) {
    this.canvas = canvas;
    this.device = device;

    // Initialize layers
    this.engine = new HyperPolyGeology(device, 256);
    this.editManager = new EditManager(device);
    this.extractor = null;
    this.draw = null;
    this.input = new MinimalInput(canvas, this);
    this.ui = new MinimalUI(canvas);
    this.audio = new MinimalAudio();

    this.lastTime = 0;
    this.simAccumulator = 0;
    this.simHz = 20;
    this.simStep = 1000 / this.simHz;
    this.isDirty = false;
  }

  async init(shellModelGenerator, wgslSources) {
    // Upload terrain
    await this.engine.uploadQuantizedTerrain(shellModelGenerator);

    // Wire edit manager
    this.engine.editManager = this.editManager;

    // Initialize extractor and draw pipeline
    this.extractor = new Phase5Extractor(this.device, 256);
    this.draw = new Phase5Draw(this.device);

    // Load WGSL sources and create pipelines
    await this.editManager.init(wgslSources.edit);
    await this.extractor.init(wgslSources);
    await this.draw.init(wgslSources);

    // Initial mesh extraction
    this.editManager.createBindGroup(
      this.engine.metaBuffer,
      this.engine.channelBuffers[0],  // density
      this.engine.channelBuffers[5],  // cohesion
      this.engine.channelBuffers[2],  // perm_x
      this.engine.channelBuffers[3],  // water
      this.engine.brickFlagsBuffer    // flags
    );
    await this.extractor.fullExtract(
      this.engine.metaBuffer,
      this.engine.channelBuffers,
      this.engine.brickFlagsBuffer
    );
    await this.draw.buildMesh(
      this.extractor.getVertexBuffer(),
      this.extractor.hermiteBuffer,
      this.extractor.getLODBuffer(),
      0.5
    );

    // Show ready
    this.ui.showMessage('HYPERPOLY v11 — Click to start', 4000);
    requestAnimationFrame((t) => this.frame(t));
  }

  frame(timestamp) {
    const dt = timestamp - this.lastTime;
    this.lastTime = timestamp;

    // 1. Handle input
    const inputState = this.input.update();

    // 2. Step simulation (fixed timestep)
    this.simAccumulator += dt;
    let stepped = false;
    while (this.simAccumulator >= this.simStep) {
      const encoder = this.device.createCommandEncoder();

      // Apply pending edits
      this.editManager.applyEdits(encoder);

      // Run simulation tick
      this.engine.stepSimulation(encoder);

      // Submit
      this.device.queue.submit([encoder.finish()]);

      this.simAccumulator -= this.simStep;
      stepped = true;
    }

    // 3. RENDER FRAME (always at display rate)
    if (stepped || this.isDirty) {
      // Extract mesh if dirty
      this.extractor.fullExtract(
        this.engine.metaBuffer,
        this.engine.channelBuffers,
        this.engine.brickFlagsBuffer
      );
      this.draw.buildMesh(
        this.extractor.getVertexBuffer(),
        this.extractor.hermiteBuffer,
        this.extractor.getLODBuffer(),
        0.5
      );
      this.isDirty = false;
    }

    // 4. Render
    this._render();

    // 5. Update UI overlay
    this.ui.render(inputState, {
      frameTime: dt,
      simHz: stepped ? this.simHz : 0
    });

    requestAnimationFrame((t) => this.frame(t));
  }

  _render() {
    // Simplified render — in production, use the existing Three.js renderer
    // or the DrawIndirect pipeline from phase5_draw.js
    const encoder = this.device.createCommandEncoder();

    // ... render pass with vertex/index buffers from this.draw ...
    // (Production: wire into your existing Three.js/WebGL2 render loop)

    this.device.queue.submit([encoder.finish()]);
  }
}
