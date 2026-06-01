// ═══════════════════════════════════════════════════════════════
// WORLD BIOMES — The Block & Vault Compound 7
// ═══════════════════════════════════════════════════════════════

// The world is 256³ voxels. Each biome occupies a quadrant:
//   The Block (NE):   x=[128,256), z=[0,128)   — concrete, neon, hard
//   Vault Cmpd 7 (SW): x=[0,128), z=[128,256)  — teal metal, amber, pulse
//   Transition zones buffer the boundary.

const BIOME = {
  BLOCK: 0,
  VAULT: 1,
  WILD: 2, // default terrain between them
};

function getBiome(x, z) {
  // World-wrapped coordinates
  const wx = ((x % WORLD) + WORLD) % WORLD;
  const wz = ((z % WORLD) + WORLD) % WORLD;

  const inBlock = wx >= 112 && wx < 192 && wz >= 48 && wz < 128;
  const inVault = wx >= 64 && wx < 144 && wz >= 128 && wz < 208;

  // Transition gradients
  if (inBlock) return BIOME.BLOCK;
  if (inVault) return BIOME.VAULT;
  return BIOME.WILD;
}

// Block palette — concrete, neon, urban hardscape
// Vault palette — teal metal, amber displays, industrial hum

// ═══════════════════════════════════════════════════════════════
// OVERLAY HUD — world name + lore indicators
// ═══════════════════════════════════════════════════════════════

// A 2D canvas overlay for world labels and lore elements
const overlayCanvas = document.createElement('canvas');
overlayCanvas.id = 'world-overlay';
overlayCanvas.style.cssText = 'display:block;position:fixed;top:0;left:0;z-index:5;pointer-events:none;';
document.body.appendChild(overlayCanvas);
const octx = overlayCanvas.getContext('2d');
let overlayW = 0, overlayH = 0;

function resizeOverlay() {
  overlayCanvas.width = overlayW = window.innerWidth;
  overlayCanvas.height = overlayH = window.innerHeight;
}
resizeOverlay();
window.addEventListener('resize', resizeOverlay);

// ── Block markers — neon grid particles for The Block ──
const NUM_BLOCK_MARKERS = 60;
const blockMarkers = [];
for (let i = 0; i < NUM_BLOCK_MARKERS; i++) {
  blockMarkers.push({
    x: 112 + Math.random() * 80,
    z: 48 + Math.random() * 80,
    phase: Math.random() * Math.PI * 2,
    flicker: Math.random() * 1000,
  });
}

// ── Vault markers — amber pulse nodes for Vault Compound 7 ──
const NUM_VAULT_BEACONS = 40;
const vaultBeacons = [];
for (let i = 0; i < NUM_VAULT_BEACONS; i++) {
  vaultBeacons.push({
    x: 64 + Math.random() * 80,
    z: 128 + Math.random() * 80,
    phase: Math.random() * Math.PI * 2,
    height: Math.random() * 3 + 1,
  });
}

// ── The Armored Defender — a slow walker in The Block ──
const defender = {
  x: 140, z: 80,
  patrolRadius: 24,
  speed: 0.15,
  angle: Math.PI * 0.75,
  active: true,
  // Plates: each carries a filtered-out number
  plates: [7, 13, 19, 23, 29, 31, 37, 41],
};

function tickDefender() {
  defender.angle += 0.002;
  defender.x = 140 + Math.cos(defender.angle) * defender.patrolRadius;
  defender.z = 80 + Math.sin(defender.angle) * defender.patrolRadius;
}

// ── Mecha Entity Alpha — stationary sentinel in Vault ──
const mechaAlpha = {
  x: 104, z: 168,
  active: true,
  displayNumber: 0,
  // Displays a running Erdos-Straus verification count
};

let mechaTick = 0;
function tickMecha(time) {
  mechaTick++;
  if (mechaTick % 30 === 0) {
    mechaAlpha.displayNumber = (mechaAlpha.displayNumber + 1) % 10000;
  }
}

// ── Draw the world overlay ──
let currentBiomeName = 'WILD';
let biomeEntryTime = 0;

function drawWorldOverlay(camPos, t, dt) {
  const ctx = octx;
  ctx.clearRect(0, 0, overlayW, overlayH);

  const biome = getBiome(camPos.x, camPos.z);
  let biomeName, biomeColor;
  switch (biome) {
    case BIOME.BLOCK:
      biomeName = 'THE BLOCK';
      biomeColor = '#ff44aa';
      break;
    case BIOME.VAULT:
      biomeName = 'VAULT COMPOUND 7';
      biomeColor = '#ff8800';
      break;
    default:
      biomeName = 'THE BETWEEN';
      biomeColor = '#4488ff';
  }

  // Track biome transitions
  if (biomeName !== currentBiomeName) {
    currentBiomeName = biomeName;
    biomeEntryTime = t;
  }

  // ── Biome name banner ──
  const elapsed = t - biomeEntryTime;
  if (elapsed < 3) {
    const alpha = elapsed < 0.5 ? elapsed * 2 : (elapsed > 2 ? (3 - elapsed) : 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = biomeColor;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = biomeColor;
    ctx.shadowBlur = 20;
    ctx.fillText(biomeName, overlayW / 2, overlayH * 0.3);
    ctx.restore();
  }

  // ── The Block markers (neon grid) ──
  if (biome === BIOME.BLOCK) {
    for (const m of blockMarkers) {
      const sx = (m.x - camPos.x) * 2 + overlayW / 2;
      const sy = (m.z - camPos.z) * 2 + overlayH / 2 - 100;
      if (sx < -50 || sx > overlayW + 50 || sy < -50 || sy > overlayH + 50) continue;

      const bright = 0.5 + 0.5 * Math.sin(t * 2 + m.phase);
      ctx.fillStyle = `rgba(255,68,170,${bright * 0.4})`;
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,68,170,0.06)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < 10; gx++) {
      const sx = (112 + gx * 8 - camPos.x) * 2 + overlayW / 2;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, overlayH);
      ctx.stroke();
    }
    for (let gz = 0; gz < 10; gz++) {
      const sy = (48 + gz * 8 - camPos.z) * 2 + overlayH / 2 - 100;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(overlayW, sy);
      ctx.stroke();
    }

    // Armored Defender indicator
    const dx = defender.x - camPos.x;
    const dz = defender.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 40) {
      const angle = Math.atan2(dz, dx);
      const edgeX = overlayW / 2 + Math.cos(angle) * 60;
      const edgeY = overlayH / 2 + Math.sin(angle) * 60;

      ctx.save();
      ctx.strokeStyle = '#ff44aa';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(overlayW / 2, overlayH / 2);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();

      ctx.fillStyle = '#ff44aa';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`DEFENDER [${dist.toFixed(0)}m]`, edgeX, edgeY - 12);
      ctx.restore();
    }
  }

  // ── Vault Compound 7 markers (amber pulse) ──
  if (biome === BIOME.VAULT) {
    for (const b of vaultBeacons) {
      const sx = (b.x - camPos.x) * 2 + overlayW / 2;
      const sy = (b.z - camPos.z) * 2 + overlayH / 2 - 100;
      if (sx < -50 || sx > overlayW + 50 || sy < -50 || sy > overlayH + 50) continue;

      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 1.43 + b.phase)); // 0.7s period
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + pulse * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,136,0,${pulse * 0.5})`;
      ctx.fill();
    }

    // Mecha Entity Alpha indicator
    const mx = mechaAlpha.x - camPos.x;
    const mz = mechaAlpha.z - camPos.z;
    const mDist = Math.sqrt(mx * mx + mz * mz);
    if (mDist < 40) {
      const angle = Math.atan2(mz, mx);
      const edgeX = overlayW / 2 + Math.cos(angle) * 60;
      const edgeY = overlayH / 2 + Math.sin(angle) * 60;

      ctx.save();
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(overlayW / 2, overlayH / 2);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();

      ctx.fillStyle = '#ff8800';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      // Modulus display — shows Erdos-Straus verification status
      ctx.fillText(`α ${mechaAlpha.displayNumber} [${mDist.toFixed(0)}m]`, edgeX, edgeY - 12);
      ctx.restore();
    }
  }

  // ── Subtitle (always on) ──
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  if (biome === BIOME.BLOCK) {
    ctx.fillText('Four corners meet one balance. Every plate carries a filtered number.', 8, overlayH - 20);
  } else if (biome === BIOME.VAULT) {
    const pulseChar = (t * 1.43) % 1 < 0.5 ? '◉' : '○';
    ctx.fillText(`${pulseChar} Mecha Entity Alpha — computing since 2017`, 8, overlayH - 20);
  } else {
    ctx.fillText('The between IS the product. The mistake IS the signal.', 8, overlayH - 20);
  }
}
