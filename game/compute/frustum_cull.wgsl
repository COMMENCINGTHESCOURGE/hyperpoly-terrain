// ──────────────────────────────────────────────────────────────
// FRUSTUM CULLING PASS — Per-brick AABB test against camera frustum
//
// Writes a culled_brick_mask bitfield: 1 = visible, 0 = culled.
// The existing culling pass (pass1_culling.wgsl) already EMA-smooths
// moisture and hysteresis-gates brick activity. This pass runs BEFORE
// that, skipping bricks that are outside the view frustum entirely.
//
// Architecture:
//   1. CPU writes 6 frustum plane equations to uniform buffer (every frame)
//   2. GPU reads per-brick AABBs from brick_meta
//   3. Each thread tests one brick: p-vertex AABB against 6 planes
//   4. If any plane culls the brick: set culled_bit = 0 in a flags buffer
//      (the existing culling pass reads this flag and skips the brick)
//
// vinculum: culling_efficiency / visible_fraction
// layer: compute
// ──────────────────────────────────────────────────────────────

struct Plane {
    normal: vec3<f32>,  // 12 bytes
    d: f32,             // 4 bytes
}

// 6 planes × 16 bytes = 96 bytes, fits in a single uniform buffer
struct FrustumPlanes {
    planes: array<Plane, 6>,
}

struct BrickAABB {
    center: vec3<f32>,
    half_extent: vec3<f32>,
}

@group(0) @binding(0) var<uniform> frustum: FrustumPlanes;

// brick_meta contains per-brick AABB data: [center.x, center.y, center.z, half_extent_max]
// Laid out as array<vec4<f32>> with 1 entry per brick
@group(0) @binding(1) var<storage, read> brick_aabb: array<vec4<f32>>;

// Output: 1 u32 per brick — bit 0 = culled (1 = visible, 0 = culled)
@group(0) @binding(2) var<storage, read_write> brick_flags: array<u32>;

@compute @workgroup_size(64)
fn frustum_cull(@builtin(global_invocation_id) gid: vec3<u32>) {
    let brick_idx = gid.x;
    let total_bricks = 4096u;  // 16³ bricks
    
    if (brick_idx >= total_bricks) { return; }
    
    let aabb = brick_aabb[brick_idx];
    let center = aabb.xyz;
    let half_extent = vec3<f32>(aabb.w, aabb.w, aabb.w);  // uniform half-extent (cubic bricks)
    
    var visible = true;
    
    // P-vertex test against all 6 planes
    for (var i = 0u; i < 6u && visible; i++) {
        let p = frustum.planes[i];
        let n = p.normal;
        
        // P-vertex: the corner most along the plane normal
        let px = select(center.x - half_extent.x, center.x + half_extent.x, n.x > 0.0);
        let py = select(center.y - half_extent.y, center.y + half_extent.y, n.y > 0.0);
        let pz = select(center.z - half_extent.z, center.z + half_extent.z, n.z > 0.0);
        
        let dist = n.x * px + n.y * py + n.z * pz + p.d;
        
        if (dist < 0.0) {
            visible = false;
        }
    }
    
    // Write visibility flag (bit 0)
    if (visible) {
        brick_flags[brick_idx] = brick_flags[brick_idx] | 1u;
    } else {
        brick_flags[brick_idx] = brick_flags[brick_idx] & ~1u;
    }
}

// ──────────────────────────────────────────────────────────────
// HOST-SIDE UPDATE
//
// Called every frame from the render loop after the camera moves.
// Writes 6 planes to the uniform buffer:
//
//   const planes = new Float32Array(6 * 4); // 6 planes × vec4<f32>
//   // fill from camera projection * view matrix
//   device.queue.writeBuffer(frustumBuffer, 0, planes);
//   // then dispatch frustum_cull with TOTAL_BRICKS / 64 workgroups
// ──────────────────────────────────────────────────────────────
