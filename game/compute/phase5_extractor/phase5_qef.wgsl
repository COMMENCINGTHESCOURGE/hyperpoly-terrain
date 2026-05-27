// ──────────────────────────────────────────────────────────────
// PHASE 5: QEF SOLVE (Quadratic Error Function with Features)
// ──────────────────────────────────────────────────────────────
// Reads: HermiteData from hermite_pass
// Writes: Dual vertex positions for mesh extraction

struct HermiteData {
  pos: vec3<f32>;
  normal: vec3<f32>;
  weight: f32;
}

@group(0) @binding(0) var<storage, read> hermite_buffer: array<HermiteData>;
@group(0) @binding(1) var<storage, read_write> vertex_buffer: array<vec3<f32>>;
@group(0) @binding(2) var<uniform> qef_params: vec2<f32>;

const CELLS: u32 = 255u;
const VERTICES_PER_DIM: u32 = 257u;
const VERTEX_STRIDE: u32 = 66049u;
const CELL_STRIDE: u32 = 65025u;  // 255 * 255

fn load_hermite(vx: u32, vy: u32, vz: u32) -> HermiteData {
  let vi = vx + vy * VERTICES_PER_DIM + vz * VERTEX_STRIDE;
  return hermite_buffer[vi];
}

@compute @workgroup_size(8, 8, 1)
fn qef_solve(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cx = gid.x;
  let cy = gid.y;
  let cz = gid.z;

  if (cx >= CELLS || cy >= CELLS || cz >= CELLS) { return; }

  // Gather 8 corner Hermite data for this cell
  var h: array<HermiteData, 8>;
  h[0] = load_hermite(cx,     cy,     cz);
  h[1] = load_hermite(cx + 1, cy,     cz);
  h[2] = load_hermite(cx,     cy + 1, cz);
  h[3] = load_hermite(cx + 1, cy + 1, cz);
  h[4] = load_hermite(cx,     cy,     cz + 1);
  h[5] = load_hermite(cx + 1, cy,     cz + 1);
  h[6] = load_hermite(cx,     cy + 1, cz + 1);
  h[7] = load_hermite(cx + 1, cy + 1, cz + 1);

  // Build QEF matrix
  var A = mat3x3<f32>(0.0);
  var b = vec3<f32>(0.0);
  var max_weight = 0.0;

  for (var i = 0u; i < 8u; i++) {
    let n = h[i].normal;
    let p = h[i].pos;
    let w = h[i].weight;
    let weight = 1.0 + w * 10.0;

    A[0][0] += weight * n.x * n.x; A[0][1] += weight * n.x * n.y; A[0][2] += weight * n.x * n.z;
    A[1][0] += weight * n.y * n.x; A[1][1] += weight * n.y * n.y; A[1][2] += weight * n.y * n.z;
    A[2][0] += weight * n.z * n.x; A[2][1] += weight * n.z * n.y; A[2][2] += weight * n.z * n.z;
    b += weight * dot(n, p) * n;
    max_weight = max(max_weight, w);
  }

  // Initialize to cell center
  var p_solution = (h[0].pos + h[7].pos) * 0.5;

  // Gradient descent
  for (var iter = 0u; iter < 10u; iter++) {
    let grad = 2.0 * (A * p_solution - b);
    p_solution -= 0.1 * grad;
  }

  // Feature preservation: blend toward sharpest corner
  if (max_weight > qef_params.x) {
    var best_corner = h[0].pos;
    var best_w = h[0].weight;
    for (var i = 1u; i < 8u; i++) {
      if (h[i].weight > best_w) {
        best_w = h[i].weight;
        best_corner = h[i].pos;
      }
    }
    p_solution = mix(p_solution, best_corner, 0.7);
  }

  let out_idx = cx + cy * CELLS + cz * CELL_STRIDE;
  vertex_buffer[out_idx] = p_solution;
}
