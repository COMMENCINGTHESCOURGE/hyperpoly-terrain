// vinculum: subdivision_ratio / detail_importance
//   How aggressively the LOD system refines cells based on material
//   gradient magnitude. Controls triangle budget allocation.
// layer: extraction
// domain: terrain (maps to radio as signal_fidelity / bandwidth_allocation,
//          text as semantic_depth / token_importance)
//
// ──────────────────────────────────────────────────────────────
// PHASE 5: ADAPTIVE LOD (Material-Driven Subdivision)
// ──────────────────────────────────────────────────────────────
// Reads: Material tensor gradients
// Writes: LOD flags per cell (0=coarse, 1=subdivide, 2=finest)

@group(0) @binding(0) var<storage, read> cohesion_u16: array<F16>;
@group(0) @binding(1) var<storage, read> perm_x_u16: array<F16>;
@group(0) @binding(2) var<storage, read_write> lod_flags: array<u32>;

const GRID: u32 = 256u;
const CELLS: u32 = 255u;
const CELL_STRIDE: u32 = 65025u;

fn decode_channel(ch: u32, idx: u32, buf: array<F16>) -> f32 {
  let metadata = brick_meta[idx * 6u + ch];
  return metadata.x + f16_decode(buf[idx]) * metadata.y;
}

@group(0) @binding(3) var<uniform> brick_meta: array<vec4<f32>>;

@compute @workgroup_size(8, 8, 8)
fn lod_compute(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cx = gid.x;
  let cy = gid.y;
  let cz = gid.z;

  if (cx >= CELLS || cy >= CELLS || cz >= CELLS) { return; }

  let idx = cx + cy * GRID + cz * GRID * GRID;

  // Sample cohesion gradient magnitude
  let c_center = decode_channel(5u, idx, cohesion_u16);
  let c_xp = decode_channel(5u, idx + 1u, cohesion_u16);
  let c_yp = decode_channel(5u, idx + GRID, cohesion_u16);
  let c_zp = decode_channel(5u, idx + GRID * GRID, cohesion_u16);

  let grad_mag = abs(c_xp - c_center) + abs(c_yp - c_center) + abs(c_zp - c_center);

  var flags = 0u;
  if (grad_mag > 0.5) {
    flags = 2u;  // Steep cliff — finest LOD
  } else if (grad_mag > 0.1) {
    flags = 1u;  // Moderate feature — subdivide once
  } else {
    flags = 0u;  // Smooth — coarse
  }

  let out_idx = cx + cy * CELLS + cz * CELL_STRIDE;
  lod_flags[out_idx] = flags;
}
