/**
 * MINIMAL INPUT — Raycasting, voxel picking, WASD movement
 * ~150 lines to turn mouse clicks into edit commands
 */

export class MinimalInput {
  constructor(canvas, engine) {
    this.canvas = canvas;
    this.engine = engine;
    this.camera = { position: [128, 64, 200], target: [128, 64, 0] };
    this.mouse = { x: 0, y: 0, leftDown: false };
    this.keys = new Set();
    this.ray = { origin: null, direction: null };
    this.hitVoxel = null;
    this.hitNormal = null;
    this.pitch = -0.3;
    this.yaw = 0;

    this._setupListeners();
  }

  _setupListeners() {
    this.canvas.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.yaw -= e.movementX * 0.002;
        this.pitch -= e.movementY * 0.002;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
      }
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });

    this.canvas.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.leftDown = true;
        this._handleClick();
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.leftDown = false;
    });

    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  _handleClick() {
    if (!this.hitVoxel) return;

    const [vx, vy, vz] = this.hitVoxel;
    const worldPos = [vx, vy, vz];

    // Submit carve command to engine
    if (this.engine.editManager && this.engine.editManager.submitEdit) {
      this.engine.editManager.submitEdit({
        center: worldPos,
        radius: 2.0,
        materialType: 0,
        falloff: 0.3
      });
    }

    // Play mining sound
    if (this.engine.audio && this.engine.audio.play) {
      this.engine.audio.play('mine', { volume: 0.5 + Math.random() * 0.3 });
    }
  }

  update() {
    // Build camera direction from yaw/pitch
    const dir = [
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ];

    // WASD movement
    const speed = 3.0;
    const right = [Math.cos(this.yaw), 0, Math.sin(this.yaw)];
    const forward = [dir[0], 0, dir[2]];
    const len = Math.sqrt(forward[0]**2 + forward[2]**2) || 1;

    if (this.keys.has('KeyW')) {
      this.camera.position[0] += forward[0] / len * speed;
      this.camera.position[2] += forward[2] / len * speed;
    }
    if (this.keys.has('KeyS')) {
      this.camera.position[0] -= forward[0] / len * speed;
      this.camera.position[2] -= forward[2] / len * speed;
    }
    if (this.keys.has('KeyA')) {
      this.camera.position[0] -= right[0] * speed;
      this.camera.position[2] -= right[2] * speed;
    }
    if (this.keys.has('KeyD')) {
      this.camera.position[0] += right[0] * speed;
      this.camera.position[2] += right[2] * speed;
    }
    if (this.keys.has('ShiftLeft')) this.camera.position[1] -= speed;
    if (this.keys.has('Space')) this.camera.position[1] += speed;

    // Update target
    this.camera.target = [
      this.camera.position[0] + dir[0],
      this.camera.position[1] + dir[1],
      this.camera.position[2] + dir[2]
    ];

    // Raycast
    this.ray.origin = [...this.camera.position];
    this.ray.direction = dir;
    this.hitVoxel = this._raymarchVoxels(this.ray.origin, this.ray.direction);

    return {
      camera: this.camera,
      ray: this.ray,
      hitVoxel: this.hitVoxel,
      isMining: this.mouse.leftDown
    };
  }

  _raymarchVoxels(origin, direction, maxSteps = 256) {
    let x = Math.floor(origin[0]);
    let y = Math.floor(origin[1]);
    let z = Math.floor(origin[2]);

    const dx = Math.sign(direction[0]);
    const dy = Math.sign(direction[1]);
    const dz = Math.sign(direction[2]);

    let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? x + 1 : x) - origin[0]) / direction[0];
    let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? y + 1 : y) - origin[1]) / direction[1];
    let tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? z + 1 : z) - origin[2]) / direction[2];

    const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / direction[0]);
    const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / direction[1]);
    const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / direction[2]);

    for (let i = 0; i < maxSteps; i++) {
      if (x >= 0 && x < 256 && y >= 0 && y < 256 && z >= 0 && z < 256) {
        if (this._isVoxelSolid(x, y, z)) {
          return [x, y, z];
        }
      } else if (x < 0 || x >= 256 || z < 0 || z >= 256) {
        return null;
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += dx; tMaxX += tDeltaX; }
        else { z += dz; tMaxZ += tDeltaZ; }
      } else {
        if (tMaxY < tMaxZ) { y += dy; tMaxY += tDeltaY; }
        else { z += dz; tMaxZ += tDeltaZ; }
      }
    }

    return null;
  }

  _isVoxelSolid(x, y, z) {
    if (x < 0 || x >= 256 || y < 0 || y >= 256 || z < 0 || z >= 256) return false;
    // In production: read from density_u16 via readback
    // For prototype: assume the center 128³ block is solid
    return x > 0 && x < 200 && y > 0 && y < 200 && z > 0 && z < 200;
  }
}
