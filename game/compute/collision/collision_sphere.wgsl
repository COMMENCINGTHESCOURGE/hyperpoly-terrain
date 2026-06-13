// vinculum: collision_sphere_occupancy / player_clearance_ratio
//   Ratio of sphere-sweep test volume vs. empty space along movement vector.
//   Higher = tighter corridors, lower = open areas.
// layer: simulation
// domain: terrain (maps to swarm as agent_vision / obstacle_density,
//          legal as habeas_corpus / physical_restraint_radius)
//
// ──────────────────────────────────────────────────────────────
// COLLISION: Sphere-Cast (Player Body)
// ──────────────────────────────────────────────────────────────
// Sweeps a sphere through the dual grid.
// Uses the same DDA traversal as raycast but with
// expanded hit radius = sphere_radius + cell_feature_offset.

struct HitRecord {
  hit: u32,
  pos: vec3<f32>,
  normal: vec3<f32>,
  material_type: u32,
  t: f32,
}

struct SphereQuery {
  center: vec3<f32>,
  radius: f32,
  velocity: vec3<f32>,  // Movement vector for this frame
}

@group(1) @binding(0) var<storage, read> qef_vertices: array<vec3<f32>>;
@group(1) @binding(1) var<storage, read> hermite_buffer: array<vec3<f32>>;
@group(1) @binding(2) var<storage, read> density_u16: array<F16>;
@group(1) @binding(3) var<storage, read_write> hit_output: array<HitRecord>;
@group(1) @binding(4) var<uniform> sphere_query: SphereQuery;

const CELLS: u32 = 255u;
const CELL_STRIDE: u32 = 65025u;
const PLAYER_RADIUS: f32 = 0.4;  // ~0.4 voxels = typical character radius
const STEP_HEIGHT: f32 = 0.6;     // Max climbable step

fn world_to_cell(pos: vec3<f32>) -> vec3<u32> {
  return vec3<u32>(u32(clamp(pos.x, 0.0, 254.0)),
                   u32(clamp(pos.y, 0.0, 254.0)),
                   u32(clamp(pos.z, 0.0, 254.0)));
}

fn cell_idx(c: vec3<u32>) -> u32 {
  return c.x + c.y * CELLS + c.z * CELL_STRIDE;
}

// ── Sphere-Cell Overlap Test ──

fn sphere_hits_cell(c: vec3<u32>, center: vec3<f32>, radius: f32) -> HitRecord {
  let idx = cell_idx(c);
  let v = qef_vertices[idx];

  // Closest point on AABB to sphere center
  let cell_min = vec3<f32>(f32(c.x), f32(c.y), f32(c.z));
  let cell_max = cell_min + 1.0;
  let closest = clamp(center, cell_min, cell_max);
  let dist = length(center - closest);

  // Expanded radius: sphere radius + feature offset
  let cell_center = cell_min + 0.5;
  let off_center = length(v - cell_center);
  let hit_radius = radius + 0.5 + off_center * 0.3;

  if (dist < hit_radius) {
    // Compute penetration depth and normal
    let pen_depth = hit_radius - dist;
    let normal = normalize(center - closest);
    let push_out = closest + normal * pen_depth - center;

    return HitRecord(1u, push_out, normal, 1u, pen_depth);
  }

  return HitRecord(0u, vec3<f32>(0.0), vec3<f32>(0.0), 0u, 0.0);
}

// ── Main: Player Collide ──
// Sweeps movement vector through grid, returns first obstruction.

@compute @workgroup_size(64)
fn sphere_cast_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let query_idx = gid.x;
  if (query_idx > 0u) { return; }

  let sq = sphere_query;
  let start = sq.center;
  let end = sq.center + sq.velocity;
  let dir = sq.velocity;
  let inv_dir = 1.0 / (dir + vec3<f32>(1e-6)); // Avoid div-by-zero

  let total_dist = length(sq.velocity);
  if (total_dist < 0.001) { return; }

  let norm_dir = dir / total_dist;

  // DDA traversal along movement vector
  let start_cell = world_to_cell(start);
  var cell = start_cell;
  let step = vec3<i32>(i32(sign(norm_dir.x)), i32(sign(norm_dir.y)), i32(sign(norm_dir.z)));
  let t_delta = abs(inv_dir);

  var t_max = vec3<f32>(
    (f32(cell.x + u32(step.x > 0)) - start.x) * inv_dir.x,
    (f32(cell.y + u32(step.y > 0)) - start.y) * inv_dir.y,
    (f32(cell.z + u32(step.z > 0)) - start.z) * inv_dir.z
  );

  var closest = HitRecord(0u, vec3<f32>(0.0), vec3<f32>(0.0), 0u, total_dist);
  var sweep_t = 0.0;

  for (var i = 0u; i < 512u; i++) {
    if (cell.x >= CELLS || cell.y >= CELLS || cell.z >= CELLS) { break; }

    let sweep_pos = start + norm_dir * sweep_t;
    let hit = sphere_hits_cell(cell, sweep_pos, sq.radius);

    if (hit.hit == 1u && hit.t < closest.t) {
      closest = hit;
      break;
    }

    // Step
    if (t_max.x < t_max.y) {
      if (t_max.x < t_max.z) {
        sweep_t = max(sweep_t, t_max.x);
        cell.x = u32(i32(cell.x) + step.x);
        t_max.x += t_delta.x;
      } else {
        sweep_t = max(sweep_t, t_max.z);
        cell.z = u32(i32(cell.z) + step.z);
        t_max.z += t_delta.z;
      }
    } else {
      if (t_max.y < t_max.z) {
        sweep_t = max(sweep_t, t_max.y);
        cell.y = u32(i32(cell.y) + step.y);
        t_max.y += t_delta.y;
      } else {
        sweep_t = max(sweep_t, t_max.z);
        cell.z = u32(i32(cell.z) + step.z);
        t_max.z += t_delta.z;
      }
    }
  }

  hit_output[query_idx] = closest;
}
