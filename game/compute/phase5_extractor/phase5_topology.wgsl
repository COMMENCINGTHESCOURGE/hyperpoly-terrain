// vinculum: vertex_emission_rate / triangle_budget
//   Ratio of emitted triangles vs max triangle budget per dispatch.
//   Controls mesh density and index buffer fill rate.
// layer: extraction
// domain: terrain (maps to housing as construction_density / material_budget,
//          transport as network_connectivity / edge_capacity)
//
// ──────────────────────────────────────────────────────────────
// PHASE 5: TOPOLOGY GENERATION (Dual Contouring Triangulation)
// ──────────────────────────────────────────────────────────────
// Reads: QEF vertex buffer, Hermite data (for edge intersections)
// Writes: Dense triangle index buffer (u32 × 3) via atomic emission

struct HermiteData {
  pos: vec3<f32>,
  normal: vec3<f32>,
  weight: f32,
}

@group(0) @binding(0) var<storage, read> qef_vertices: array<vec3<f32>>;
@group(0) @binding(1) var<storage, read> hermite_buffer: array<HermiteData>;
@group(0) @binding(2) var<storage, read_write> index_buffer: array<u32>;
@group(0) @binding(3) var<storage, read_write> index_count: atomic<u32>;
@group(0) @binding(4) var<uniform> iso_threshold: f32;

const CELLS: u32 = 255u;
const CELL_STRIDE: u32 = 65025u;
const VERTS_PER_DIM: u32 = 257u;
const VERT_STRIDE: u32 = 66049u;

fn load_density(cx: u32, cy: u32, cz: u32) -> f32 {
  // Hermite data pos.x stores interpolated density at this vertex
  let vi = cx + cy * VERTS_PER_DIM + cz * VERT_STRIDE;
  return hermite_buffer[vi].pos.x;
}

fn snap_to_grid(vi: u32) -> vec3<u32> {
  let vz = vi / VERT_STRIDE;
  let rem = vi % VERT_STRIDE;
  let vy = rem / VERTS_PER_DIM;
  let vx = rem % VERTS_PER_DIM;
  return vec3(vx, vy, vz);
}

@compute @workgroup_size(8, 8, 1)
fn topology_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cx = gid.x;
  let cy = gid.y;
  let cz = gid.z;

  if (cx >= CELLS || cy >= CELLS || cz >= CELLS) { return; }

  let cell_idx = cx + cy * CELLS + cz * CELL_STRIDE;
  let cell_v = qef_vertices[cell_idx];

  // Sample density at 8 corners of this cell
  let d000 = load_density(cx,     cy,     cz);
  let d100 = load_density(cx + 1, cy,     cz);
  let d010 = load_density(cx,     cy + 1, cz);
  let d110 = load_density(cx + 1, cy + 1, cz);
  let d001 = load_density(cx,     cy,     cz + 1);
  let d101 = load_density(cx + 1, cy,     cz + 1);
  let d011 = load_density(cx,     cy + 1, cz + 1);
  let d111 = load_density(cx + 1, cy + 1, cz + 1);

  // Test 6 faces for sign change
  // Face is active when 2 adjacent corners straddle the iso surface

  // +X face: corners (1,0,0), (1,1,0), (1,0,1), (1,1,1)
  let face_xp = (d100 - iso_threshold) * (d110 - iso_threshold) < 0.0 ||
                (d100 - iso_threshold) * (d101 - iso_threshold) < 0.0 ||
                (d101 - iso_threshold) * (d111 - iso_threshold) < 0.0;

  if (face_xp) {
    // Emit 2 triangles (fan from cell center to face corners)
    // Face corners are the shared edge vertices between this cell and +X neighbor
    let base = atomicAdd(&index_count, 6u);
    // Triangle 1: cell_v, (cx+1,cy,cz), (cx+1,cy+1,cz)
    index_buffer[base]     = cell_idx;
    index_buffer[base + 1] = (cx + 1) + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 2] = (cx + 1) + (cy + 1) * CELLS + cz * CELL_STRIDE;
    // Triangle 2: cell_v, (cx+1,cy+1,cz), (cx+1,cy,cz+1)
    index_buffer[base + 3] = cell_idx;
    index_buffer[base + 4] = (cx + 1) + (cy + 1) * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 5] = (cx + 1) + cy * CELLS + (cz + 1) * CELL_STRIDE;
  }

  // -X face: corners (0,0,0), (0,1,0), (0,0,1), (0,1,1)
  let face_xm = (d000 - iso_threshold) * (d010 - iso_threshold) < 0.0 ||
                (d000 - iso_threshold) * (d001 - iso_threshold) < 0.0 ||
                (d001 - iso_threshold) * (d011 - iso_threshold) < 0.0;

  if (face_xm && cx > 0u) {
    let base = atomicAdd(&index_count, 6u);
    index_buffer[base]     = cell_idx;
    index_buffer[base + 1] = cx + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 2] = cx + (cy + 1) * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 3] = cell_idx;
    index_buffer[base + 4] = cx + (cy + 1) * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 5] = cx + cy * CELLS + (cz + 1) * CELL_STRIDE;
  }

  // +Y face: corners (0,1,0), (1,1,0), (0,1,1), (1,1,1)
  let face_yp = (d010 - iso_threshold) * (d110 - iso_threshold) < 0.0 ||
                (d010 - iso_threshold) * (d011 - iso_threshold) < 0.0 ||
                (d011 - iso_threshold) * (d111 - iso_threshold) < 0.0;

  if (face_yp) {
    let base = atomicAdd(&index_count, 6u);
    index_buffer[base]     = cell_idx;
    index_buffer[base + 1] = cx + (cy + 1) * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 2] = (cx + 1) + (cy + 1) * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 3] = cell_idx;
    index_buffer[base + 4] = (cx + 1) + (cy + 1) * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 5] = cx + (cy + 1) * CELLS + (cz + 1) * CELL_STRIDE;
  }

  // -Y face: corners (0,0,0), (1,0,0), (0,0,1), (1,0,1)
  let face_ym = (d000 - iso_threshold) * (d100 - iso_threshold) < 0.0 ||
                (d000 - iso_threshold) * (d001 - iso_threshold) < 0.0 ||
                (d001 - iso_threshold) * (d101 - iso_threshold) < 0.0;

  if (face_ym && cy > 0u) {
    let base = atomicAdd(&index_count, 6u);
    index_buffer[base]     = cell_idx;
    index_buffer[base + 1] = cx + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 2] = (cx + 1) + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 3] = cell_idx;
    index_buffer[base + 4] = (cx + 1) + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 5] = cx + cy * CELLS + (cz + 1) * CELL_STRIDE;
  }

  // +Z face: corners (0,0,1), (1,0,1), (0,1,1), (1,1,1)
  let face_zp = (d001 - iso_threshold) * (d101 - iso_threshold) < 0.0 ||
                (d001 - iso_threshold) * (d011 - iso_threshold) < 0.0 ||
                (d011 - iso_threshold) * (d111 - iso_threshold) < 0.0;

  if (face_zp) {
    let base = atomicAdd(&index_count, 6u);
    index_buffer[base]     = cell_idx;
    index_buffer[base + 1] = cx + cy * CELLS + (cz + 1) * CELL_STRIDE;
    index_buffer[base + 2] = (cx + 1) + cy * CELLS + (cz + 1) * CELL_STRIDE;
    index_buffer[base + 3] = cell_idx;
    index_buffer[base + 4] = (cx + 1) + cy * CELLS + (cz + 1) * CELL_STRIDE;
    index_buffer[base + 5] = cx + (cy + 1) * CELLS + (cz + 1) * CELL_STRIDE;
  }

  // -Z face: corners (0,0,0), (1,0,0), (0,1,0), (1,1,0)
  let face_zm = (d000 - iso_threshold) * (d100 - iso_threshold) < 0.0 ||
                (d000 - iso_threshold) * (d010 - iso_threshold) < 0.0 ||
                (d010 - iso_threshold) * (d110 - iso_threshold) < 0.0;

  if (face_zm && cz > 0u) {
    let base = atomicAdd(&index_count, 6u);
    index_buffer[base]     = cell_idx;
    index_buffer[base + 1] = cx + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 2] = (cx + 1) + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 3] = cell_idx;
    index_buffer[base + 4] = (cx + 1) + cy * CELLS + cz * CELL_STRIDE;
    index_buffer[base + 5] = cx + (cy + 1) * CELLS + cz * CELL_STRIDE;
  }
}
