// ──────────────────────────────────────────────────────────────
// PHASE 5: HERMITE DATA GENERATION (Multi-Channel Gradients)
// ──────────────────────────────────────────────────────────────
// Reads: 6-channel material tensor (quantized u16)
// Writes: HermiteData { position: vec3<f32>, normal: vec3<f32>, feature_weight: f32 }

struct HermiteData {
  pos: vec3<f32>;
  normal: vec3<f32>;
  weight: f32;  // Feature preservation strength (0=smooth, 1=sharp)
}

@group(0) @binding(0) var<uniform> brick_meta: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> density_u16: array<F16>;
@group(0) @binding(2) var<storage, read> cohesion_u16: array<F16>;
@group(0) @binding(3) var<storage, read> perm_x_u16: array<F16>;
@group(0) @binding(4) var<storage, read_write> hermite_buffer: array<HermiteData>;

const ISO_LEVEL: f32 = 0.5;
const GRID: u32 = 256u;
const VERTICES_PER_DIM: u32 = 257u;  // GRID + 1
const VERTEX_STRIDE: u32 = 66049u;   // 257 * 257

fn decode_density(idx: u32) -> f32 {
  let meta = brick_meta[idx * 6u];
  return meta.x + f16_decode(density_u16[idx]) * meta.y;
}

fn decode_cohesion(idx: u32) -> f32 {
  let meta = brick_meta[idx * 6u + 5u];
  return meta.x + f16_decode(cohesion_u16[idx]) * meta.y;
}

fn sample_vertex(vx: u32, vy: u32, vz: u32) -> HermiteData {
  let idx = vx + vy * GRID + vz * GRID * GRID;
  let vi = vx + vy * VERTICES_PER_DIM + vz * VERTEX_STRIDE;

  let d000 = decode_density(idx);
  let d100 = decode_density(idx + 1u);
  let d010 = decode_density(idx + GRID);
  let d001 = decode_density(idx + GRID * GRID);

  let grad_density = vec3<f32>(
    (d100 - decode_density(idx - 1u)) * 0.5,
    (d010 - decode_density(idx - GRID)) * 0.5,
    (d001 - decode_density(idx - GRID * GRID)) * 0.5
  );

  let c000 = decode_cohesion(idx);
  let c100 = decode_cohesion(idx + 1u);
  let c010 = decode_cohesion(idx + GRID);
  let c001 = decode_cohesion(idx + GRID * GRID);

  let grad_cohesion = vec3<f32>(
    (c100 - decode_cohesion(idx - 1u)) * 0.5,
    (c010 - decode_cohesion(idx - GRID)) * 0.5,
    (c001 - decode_cohesion(idx - GRID * GRID)) * 0.5
  );

  let cohesion_mag = length(grad_cohesion);
  let feature_weight = clamp(cohesion_mag * 10.0, 0.0, 1.0);

  let d_center = d000;
  let t = (ISO_LEVEL - d_center) / (length(grad_density) + 1e-6);
  let pos = vec3<f32>(f32(vx), f32(vy), f32(vz)) + grad_density * t;

  let normal = normalize(mix(grad_density, grad_cohesion, feature_weight * 0.5));

  return HermiteData(pos, normal, feature_weight);
}

@compute @workgroup_size(8, 8, 8)
fn hermite_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vx = gid.x + 1u;
  let vy = gid.y + 1u;
  let vz = gid.z + 1u;

  if (vx >= GRID || vy >= GRID || vz >= GRID) { return; }

  let vi = vx + vy * VERTICES_PER_DIM + vz * VERTEX_STRIDE;
  hermite_buffer[vi] = sample_vertex(vx, vy, vz);
}
