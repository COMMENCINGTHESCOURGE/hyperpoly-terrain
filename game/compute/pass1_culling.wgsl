// vinculum: culling_efficiency / visible_fraction
//   Ratio of active brick cells vs total grid cells after visibility culling.
//   Drives downstream dispatch sizing.
// layer: compute
// domain: terrain (maps to swarm as search_coverage / explored_fraction,
//          evacuation as safe_zone_ratio / total_area)
//
struct BrickMeta {
  min: f32, scale: f32, moisture: f32, stability: f32,
}

struct DispatchArgs { count_x: u32, count_y: u32, count_z: u32 }

@group(0) @binding(0) var<storage, read> meta_buffer: array<BrickMeta>;
@group(0) @binding(1) var<storage, read_write> brick_state: array<u32>;
@group(0) @binding(2) var<storage, read_write> raw_queue: array<u32>;
@group(0) @binding(3) var<storage, read_write> queue_count: atomic<u32>;
@group(0) @binding(4) var<uniform> dispatch_args: DispatchArgs;
@group(0) @binding(5) var<uniform> sched_params: vec4<f32>;

@compute @workgroup_size(64)
fn culling_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let brick_idx = gid.x;
  if (brick_idx >= 4096u) { return; }

  let meta = meta_buffer[brick_idx];
  let moisture = meta.moisture;
  let stability = meta.stability;

  // EMA smoothing using brick_state high bits
  let last_moisture = f32((brick_state[brick_idx] >> 8u) & 0xFFu) / 255.0;
  let alpha = sched_params.z;
  let smooth_moisture = mix(last_moisture, moisture, alpha);

  // Hysteresis deadband
  let was_active = (brick_state[brick_idx] & 1u) == 1u;
  let activate = (smooth_moisture > sched_params.x) || (stability < sched_params.y);
  let deactivate = (smooth_moisture < sched_params.x - sched_params.w) && (stability > sched_params.y + 0.1);
  let active = was_active ? !deactivate : activate;

  // Update persistent state
  var state = brick_state[brick_idx];
  state = (state & 0xFFFFFF00u) | (u32(clamp(smooth_moisture * 255.0, 0.0, 255.0)) << 8u);
  state = (state & 0xFFFFFFFEu) | (select(0u, 1u, active));
  brick_state[brick_idx] = state;

  // Enqueue if active
  if (active) {
    let slot = atomicAdd(&queue_count, 1u);
    if (slot < 4096u) { raw_queue[slot] = brick_idx; }
  }
}
