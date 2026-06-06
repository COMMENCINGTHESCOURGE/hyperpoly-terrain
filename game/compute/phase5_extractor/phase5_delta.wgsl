// vinculum: change_magnitude / frame_stability
//   Ratio of vertex positions changed vs total mesh vertices per frame.
//   Drives streaming cost for incremental mesh updates.
// layer: extraction
// domain: terrain (maps to economy as price_movement / market_stability,
//          radio as signal_drift / carrier_stability)
//
// ──────────────────────────────────────────────────────────────
// PHASE 5: DELTA MESH STREAMING (Incremental Updates)
// ──────────────────────────────────────────────────────────────
// Reads: Metadata change flags + previous dual vertex buffer
// Writes: Vertex deltas for GPU transform feedback

struct MeshDelta {
  vertex_idx: u32;
  delta_pos: vec3<f32>;
  delta_normal: vec3<f32>;
}

struct BrickMetaCompact {
  moisture: f32;
  stability: f32;
  change_flag: u32;
  _pad: u32;
}

@group(0) @binding(0) var<storage, read> brick_meta: array<BrickMetaCompact>;
@group(0) @binding(1) var<storage, read> prev_vertices: array<vec3<f32>>;
@group(0) @binding(2) var<storage, read> new_vertices: array<vec3<f32>>;
@group(0) @binding(3) var<storage, read_write> vertex_deltas: array<MeshDelta>;
@group(0) @binding(4) var<storage, read_write> delta_count: atomic<u32>;

const BRICKS_PER_DIM: u32 = 16u;
const TOTAL_BRICKS: u32 = 4096u;
const VOXELS_PER_BRICK: u32 = 4096u;
const VERTICES_PER_BRICK_DIM: u32 = 17u;  // 16 + 1
const VERTICES_PER_BRICK: u32 = 4913u;     // 17^3

@compute @workgroup_size(64)
fn delta_compute(@builtin(global_invocation_id) gid: vec3<u32>) {
  let brick_idx = gid.x;
  if (brick_idx >= TOTAL_BRICKS) { return; }

  let meta = brick_meta[brick_idx];
  if (meta.change_flag == 0u) { return; }

  // For each vertex belonging to this brick, compute delta
  let bz = brick_idx / (BRICKS_PER_DIM * BRICKS_PER_DIM);
  let by = (brick_idx / BRICKS_PER_DIM) % BRICKS_PER_DIM;
  let bx = brick_idx % BRICKS_PER_DIM;

  let vertex_base = bx * 17u + by * 17u * 257u + bz * 17u * 66049u;

  for (var vz = 0u; vz < 17u; vz++) {
    for (var vy = 0u; vy < 17u; vy++) {
      for (var vx = 0u; vx < 17u; vx++) {
        let vi = vertex_base + vx + vy * 257u + vz * 66049u;
        let new_pos = new_vertices[vi];
        let old_pos = prev_vertices[vi];
        let delta = new_pos - old_pos;

        if (length(delta) > 0.001) {
          let slot = atomicAdd(&delta_count, 1u);
          vertex_deltas[slot] = MeshDelta(vi, delta, vec3<f32>(0.0, 0.0, 0.0));
        }
      }
    }
  }
}
