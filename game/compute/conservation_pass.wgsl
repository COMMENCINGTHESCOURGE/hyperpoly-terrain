// vinculum: mass_exchange / volume_correction
//   Ratio of water volume redistributed vs. total water volume per brick.
//   Ensures closed-system conservation across erosion cycles.
// layer: simulation
// domain: terrain (maps to economy as capital_preservation / wealth_redistribution,
//          evacuation as supply_allocation / population_carrying_capacity)
//
@group(0) @binding(0) var<storage, read> water_dst_u16: array<F16>;
@group(0) @binding(1) var<storage, read_write> water_corrected_u16: array<F16>;
@group(0) @binding(2) var<uniform> brick_meta: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> initial_brick_water_mass: array<f32>;

var<workgroup> wg_sum: array<f32, 256>;

@compute @workgroup_size(8,8,8)
fn conservation_pass(@builtin(global_invocation_id) gid: vec3<u32>,
                     @builtin(local_invocation_id) lid: vec3<u32>) {
  let local_idx = lid.x + lid.y * 16u + lid.z * 256u;
  let brick_idx = gid.x / 16u + (gid.y / 16u) * 16u + (gid.z / 16u) * 256u;

  // Decode current value
  let meta = brick_meta[brick_idx * 6u];
  let encoded = water_dst_u16[brick_idx * 4096u + local_idx];
  let val = meta.x + f16_decode(encoded) * meta.y;
  wg_sum[local_idx] = val;
  workgroupBarrier();

  // Workgroup reduction
  var shift = 128u;
  loop {
    if (shift == 0u) { break; }
    if (local_idx < shift) { wg_sum[local_idx] += wg_sum[local_idx + shift]; }
    workgroupBarrier();
    shift >>= 1u;
  }

  // Thread 0 computes correction using the INITIAL brick mass as baseline
  if (local_idx == 0u) {
    let expected_mass = initial_brick_water_mass[brick_idx];
    let drift = (wg_sum[0] - expected_mass) / 4096.0;

    // Apply distributed correction to all voxels in this brick
    for (var i = 0u; i < 4096u; i++) {
      let raw = water_dst_u16[brick_idx * 4096u + i];
      let decoded = meta.x + f16_decode(raw) * meta.y;
      let corrected = decoded - drift;
      let norm = clamp((corrected - meta.x) / meta.y, 0.0, 1.0);
      water_corrected_u16[brick_idx * 4096u + i] = f16_encode(norm);
    }
  }
}
