// ──────────────────────────────────────────────────────────────
// PHASE 6A: ATOMIC MATERIAL INJECTION (Carving + Ore Placement)
// ─────────────────────────────────────────────────────────────
// Reads: EditCommand ring buffer, material tensor (u16), brick_meta (uniform)
// Writes: Material tensor (u16), edit_min/max shadow buffers, brick_flags
// Guarantees: Zero host-GPU sync, quantization-consistent edits via dynamic range expansion

struct EditCommand {
  center: vec3<f32>;
  radius: f32;
  material_type: u32;
  falloff: f32;
}

// ── Shadow Buffers for Dynamic Range Expansion ────────────────
// Initialized to 0xFFFF (sentinel = "use uniform meta")
// When an edit pushes a value outside the brick's original [min, max],
// the shadow buffer is updated atomically and the decoder uses the tighter bound.
@group(0) @binding(0) var<storage, read_write> edit_min_buffer: array<F16>; // [brick_idx * 6 + ch]
@group(0) @binding(1) var<storage, read_write> edit_max_buffer: array<F16>;

// ── Material Tensor (Quantized u16) ───────────────────────────
@group(0) @binding(2) var<storage, read_write> density_u16:    array<F16>;
@group(0) @binding(3) var<storage, read_write> cohesion_u16:   array<F16>;
@group(0) @binding(4) var<storage, read_write> perm_x_u16:     array<F16>;
@group(0) @binding(5) var<storage, read_write> water_u16:      array<F16>;

// ── Metadata ──────────────────────────────────────────────────
@group(0) @binding(6) var<uniform> brick_meta: array<vec4<f32>>;
@group(0) @binding(7) var<storage, read_write> brick_flags: array<u32>;

// ── Edit Queue ────────────────────────────────────────────────
@group(0) @binding(8) var<storage, read> edit_queue: array<EditCommand>;
@group(0) @binding(9) var<storage, read> edit_count: atomic<u32>;

const SENTINEL: u32 = 0xFFFFu;
const VOXELS_PER_BRICK: u32 = 4096u;

// ── Helper: Encode with Range Expansion Detection ─────────────
fn encode_with_expansion(ch: u32, brick_idx: u32, local_idx: u32, val: f32, dst: ptr<function, array<F16>>) -> bool {
  let meta = brick_meta[brick_idx * 6u + ch];
  let norm = (val - meta.x) / meta.y;

  let needs_expand_min = (val < meta.x);
  let needs_expand_max = (val > meta.x + meta.y);

  let clamped = clamp(norm, 0.0, 1.0);
  (*dst)[brick_idx * VOXELS_PER_BRICK + local_idx] = f16_encode(clamped);

  return needs_expand_min || needs_expand_max;
}

fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
  let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

// ── Main Kernel: Process All Edit Commands ────────────────────
@compute @workgroup_size(64)
fn inject_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cmd_idx = gid.x;
  let total_edits = atomicLoad(&edit_count);
  if (cmd_idx >= total_edits) { return; }

  let cmd = edit_queue[cmd_idx];

  // Broad-phase: each thread handles one brick
  // gid.y encodes brick_idx (dispatched as ceil(4096/64) workgroups in Y)
  let brick_idx = gid.y * 64u + gid.z;
  if (brick_idx >= 4096u) { return; }

  // Decode brick coordinates
  let bx = brick_idx % 16u;
  let by = (brick_idx / 16u) % 16u;
  let bz = brick_idx / 256u;
  let brick_center = vec3<f32>(f32(bx) * 16.0 + 8.0, f32(by) * 16.0 + 8.0, f32(bz) * 16.0 + 8.0);

  // Skip if brick outside edit sphere (+ half-diagonal margin)
  let dist = distance(brick_center, cmd.center);
  if (dist > cmd.radius + 14.0) { return; }

  // Narrow phase: iterate voxels in this brick
  for (var lz = 0u; lz < 16u; lz++) {
    for (var ly = 0u; ly < 16u; ly++) {
      for (var lx = 0u; lx < 16u; lx++) {
        let local_idx = lx + ly * 16u + lz * 256u;
        let world_pos = vec3<f32>(
          f32(bx * 16u + lx),
          f32(by * 16u + ly),
          f32(bz * 16u + lz)
        );

        let d = distance(world_pos, cmd.center);
        if (d > cmd.radius) { continue; }

        // Compute material values based on edit type
        var new_density = 1.0;
        var new_cohesion = 1.0;
        var new_perm = 0.1;
        var clear_water = false;

        if (cmd.material_type == 0u) { // Carve → Air
          let t = smoothstep(cmd.radius, cmd.radius * (1.0 - cmd.falloff), d);
          new_density = mix(0.0, 1.0, t);
          new_cohesion = mix(0.0, 1.0, t);
          new_perm = 1.0;
          clear_water = (t > 0.5); // Clear water in fully carved voxels
        } else if (cmd.material_type == 1u) { // Inject Ore
          let t = smoothstep(cmd.radius * 0.5, cmd.radius, d);
          new_density = mix(0.95, 0.5, t);
          new_cohesion = mix(0.99, 0.7, t);
          new_perm = mix(0.01, 0.3, t);
        } else if (cmd.material_type == 2u) { // Compacted fill
          new_density = 0.8;
          new_cohesion = 0.9;
          new_perm = 0.001;
        }

        // Encode with range expansion detection
        if (encode_with_expansion(0u, brick_idx, local_idx, new_density, &density_u16)) {
          atomicMin(&edit_min_buffer[brick_idx * 6u + 0u], F16(new_density));
          atomicMax(&edit_max_buffer[brick_idx * 6u + 0u], F16(new_density));
        }
        if (encode_with_expansion(1u, brick_idx, local_idx, new_cohesion, &cohesion_u16)) {
          atomicMin(&edit_min_buffer[brick_idx * 6u + 1u], F16(new_cohesion));
          atomicMax(&edit_max_buffer[brick_idx * 6u + 1u], F16(new_cohesion));
        }
        if (encode_with_expansion(2u, brick_idx, local_idx, new_perm, &perm_x_u16)) {
          atomicMin(&edit_min_buffer[brick_idx * 6u + 2u], F16(new_perm));
          atomicMax(&edit_max_buffer[brick_idx * 6u + 2u], F16(new_perm));
        }

        // Clear water in carved voids (prevent physics explosion)
        if (clear_water) {
          water_u16[brick_idx * VOXELS_PER_BRICK + local_idx] = f16_encode(0.0);
        }
      }
    }
  }

  // Flag brick as dirty for scheduler + extraction
  // Bit 0: simulation dirty (scheduler activates next tick)
  // Bit 1: mesh dirty (extractor re-extracts next frame)
  atomicOr(&brick_flags[brick_idx], 0x3u);
}
