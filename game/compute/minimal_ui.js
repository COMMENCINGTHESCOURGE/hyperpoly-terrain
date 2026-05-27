/**
 * MINIMAL UI — Crosshair, target highlight, HUD
 * ~120 lines to show the player what they're looking at and doing
 */

export class MinimalUI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.oreCount = 0;
    this.targetHighlight = null;
    this.messages = [];
    this.messageTimer = 0;
  }

  showMessage(text, duration = 3000) {
    this.messages.push({ text, time: performance.now(), duration });
    this.messageTimer = duration;
  }

  render(inputState, engineState) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Crosshair
    ctx.strokeStyle = inputState.hitVoxel ? 'rgba(255, 255, 0, 0.9)' : 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 12, h / 2); ctx.lineTo(w / 2 - 4, h / 2);
    ctx.moveTo(w / 2 + 4, h / 2); ctx.lineTo(w / 2 + 12, h / 2);
    ctx.moveTo(w / 2, h / 2 - 12); ctx.lineTo(w / 2, h / 2 - 4);
    ctx.moveTo(w / 2, h / 2 + 4); ctx.lineTo(w / 2, h / 2 + 12);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = inputState.hitVoxel ? '#ff0' : '#fff';
    ctx.fillRect(w / 2 - 1, h / 2 - 1, 3, 3);

    // 2. Target info (if voxel hit)
    if (inputState.hitVoxel) {
      const [vx, vy, vz] = inputState.hitVoxel;

      // Crosshair turn yellow and show distance
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      const dist = inputState.ray.origin ?
        Math.sqrt((vx - inputState.ray.origin[0])**2 +
                  (vy - inputState.ray.origin[1])**2 +
                  (vz - inputState.ray.origin[2])**2) : 0;

      ctx.fillRect(w / 2 - 60, h / 2 + 20, 120, 22);
      ctx.fillStyle = '#ff0';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${vx}, ${vy}, ${vz}  [${Math.round(dist)}m]`, w / 2, h / 2 + 36);

      // Corner brackets around target (simplified world-to-screen)
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(w / 2 - 25, h / 2 - 25, 50, 50);
    }

    // 3. Info panel (top-left)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 180, 70);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Ore: ${this.oreCount}`, 20, 32);

    ctx.fillStyle = '#aaa';
    ctx.font = '12px monospace';
    const fps = Math.round(1000 / (engineState.frameTime || 16));
    ctx.fillStyle = fps >= 55 ? '#0f0' : fps >= 30 ? '#ff0' : '#f00';
    ctx.fillText(`${fps} FPS`, 20, 50);

    ctx.fillStyle = '#888';
    const simHz = engineState.simHz || 20;
    ctx.fillText(`Sim: ${simHz} Hz`, 20, 66);

    // 4. Messages (center, fading)
    const now = performance.now();
    this.messages = this.messages.filter(m => now - m.time < m.duration);
    for (let i = 0; i < this.messages.length; i++) {
      const m = this.messages[i];
      const alpha = Math.min(1, 2 * (1 - (now - m.time) / m.duration));
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(m.text, w / 2, h / 2 - 80 - i * 30);
    }

    // 5. Instructions (bottom)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(w / 2 - 170, h - 36, 340, 28);
    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CLICK to lock mouse  |  WASD+Space+Shift: Move  |  Left Click: Mine', w / 2, h - 16);
  }

  incrementOre(amount = 1) {
    this.oreCount += amount;
  }
}
