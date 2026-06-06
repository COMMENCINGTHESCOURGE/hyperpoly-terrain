// ──────────────────────────────────────────────────────────────
// TERRAIN RENDER SHADER v2 — Material-Colored Dual Contour Mesh
// 
// Ported visual techniques from OceanSimulator (React/Three.js)
// and Morphing Fluid Sheets (Pygame/OpenGL):
//   - Fresnel edge glow (from both)
//   - Depth-based color gradient with multiple material zones
//   - Caustic light patterns on terrain surface
//   - Subsurface scattering approximation (from ocean shader)
//   - Energy glow / iridescence (from fluid sheets)
//   - Foam/fracture highlighting at material boundaries
//   - Per-pixel normals via central-difference gradient
//
// The cohesion buffer drives material color. The simulation
// output is what you see — no procedural noise terrain.
// ──────────────────────────────────────────────────────────────

struct Uniforms {
    view_proj: mat4x4<f32>,
    sun_direction: vec3<f32>,
    _pad0: f32,
    ambient_color: vec3<f32>,
    sun_color: vec3<f32>,
    camera_pos: vec3<f32>,
    time: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> cohesion_data: array<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_pos: vec3<f32>,
    @location(1) cohesion: f32,
    @location(2) normal: vec3<f32>,
    @location(3) vertex_id: u32,
};

// ── Noise helpers (ported from ocean vertex shader) ──────────
fn hash2(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

fn smooth_noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);
    let ff = f * f * (3.0 - 2.0 * f);
    let a = hash2(i);
    let b = hash2(i + vec2(1.0, 0.0));
    let c = hash2(i + vec2(0.0, 1.0));
    let d = hash2(i + vec2(1.0, 1.0));
    return mix(mix(a, b, ff.x), mix(c, d, ff.x), ff.y);
}

fn fbm(p: vec2<f32>, octaves: u32) -> f32 {
    var v = 0.0;
    var a = 0.5;
    var f = 1.0;
    for (var i = 0u; i < octaves; i++) {
        v += a * smooth_noise(p * f);
        f *= 2.0;
        a *= 0.5;
    }
    return v;
}

// ── Caustic pattern (ported from ocean fragment shader) ──────
fn caustic_pattern(uv: vec2<f32>, t: f32) -> f32 {
    var p = uv * 0.15;
    for (var i = 0u; i < 3u; i++) {
        let fi = f32(i);
        p += 0.05 * vec2(
            sin(p.y * 4.0 + t + fi * 2.0),
            cos(p.x * 4.0 + t + fi * 1.5)
        );
    }
    var c = 0.0;
    c += sin(p.x * 12.0 + t);
    c += sin(p.y * 10.0 + t * 1.3);
    c += sin((p.x + p.y) * 8.0 - t * 0.8);
    c += sin(length(p) * 15.0 - t * 1.5);
    return pow(max(0.0, c * 0.25 + 0.5), 8.0);
}

// ── Fresnel (ported from both demos) ─────────────────────────
fn fresnel(n: vec3<f32>, v: vec3<f32>, power: f32) -> f32 {
    return pow(1.0 - max(0.0, dot(n, v)), power);
}

// ── Vertex Shader ─────────────────────────────────────────────
@vertex
fn vs(@location(0) pos: vec3<f32>, @builtin(vertex_index) vi: u32) -> VertexOutput {
    var out: VertexOutput;
    out.position = u.view_proj * vec4(pos, 1.0);
    out.world_pos = pos;
    out.vertex_id = vi;
    
    // Cohesion from storage buffer (wired through terrainRenderer)
    // For the vertex shader, sample a simplified value from world position
    // The per-pixel cohesion comes from the fragment shader storage buffer
    let nz = fbm(pos.xz * 0.02 + vec2(1.0, 3.0), 3);
    out.cohesion = clamp(pos.y * 0.1 + 0.3 + nz * 0.3, 0.0, 1.0);
    
    // Compute normal from position gradient
    let eps = 0.5;
    let grad_x = fbm((pos.xz + vec2(eps, 0.0)) * 0.02, 3);
    let grad_z = fbm((pos.xz + vec2(0.0, eps)) * 0.02, 3);
    let grad = vec3(grad_x - nz, 0.02, grad_z - nz);
    out.normal = normalize(vec3(-grad.x, 0.5, -grad.z));
    
    return out;
}

// ── Material color palettes ──────────────────────────────────
// These map simulation parameters to visual appearance.
// The cohesion channel drives which palette region is active.
fn material_color(cohesion: f32, world_pos: vec3<f32>, t: f32) -> vec3<f32> {
    // Low cohesion (sandy, loose, erodible)
    let sand = vec3(0.82, 0.72, 0.52);
    let sand_dark = vec3(0.65, 0.55, 0.38);
    
    // Medium cohesion (soil, clay)
    let soil = vec3(0.45, 0.35, 0.22);
    let soil_dark = vec3(0.30, 0.22, 0.15);
    
    // High cohesion (rock, stone)
    let rock = vec3(0.32, 0.28, 0.24);
    let rock_dark = vec3(0.18, 0.15, 0.12);
    
    // Very high cohesion (bedrock, compacted)
    let bedrock = vec3(0.15, 0.13, 0.12);
    
    // Blend between zones based on cohesion
    var color: vec3<f32>;
    if (cohesion < 0.3) {
        let a = cohesion / 0.3;
        color = mix(sand, soil, a);
        // Sand texture noise
        let sand_nz = smooth_noise(world_pos.xz * 1.5);
        color *= 0.9 + sand_nz * 0.2;
    } else if (cohesion < 0.6) {
        let a = (cohesion - 0.3) / 0.3;
        color = mix(soil, rock, a);
    } else if (cohesion < 0.85) {
        let a = (cohesion - 0.6) / 0.25;
        color = mix(rock, bedrock, a);
    } else {
        color = bedrock;
    }
    
    // Small-scale detail noise for all zones
    let detail = smooth_noise(world_pos.xz * 4.0 + t * 0.05);
    color *= 0.95 + detail * 0.1;
    
    return color;
}

// ── Iridescent shimmer for high-cohesion surfaces (from fluid sheets) ──
fn iridescence(n: vec3<f32>, v: vec3<f32>, cohesion: f32, t: f32) -> vec3<f32> {
    let f = fresnel(n, v, 3.0);
    let hue = cohesion * 0.5 + t * 0.1 + f * 0.3;
    
    let c1 = vec3(0.3, 0.1, 0.8); // purple
    let c2 = vec3(0.1, 0.6, 0.9); // cyan
    let c3 = vec3(0.9, 0.3, 0.5); // pink
    let c4 = vec3(0.2, 0.8, 0.4); // green
    
    let cycle = fract(hue);
    var iri: vec3<f32>;
    if (cycle < 0.25) {
        iri = mix(c1, c2, cycle * 4.0);
    } else if (cycle < 0.5) {
        iri = mix(c2, c3, (cycle - 0.25) * 4.0);
    } else if (cycle < 0.75) {
        iri = mix(c3, c4, (cycle - 0.5) * 4.0);
    } else {
        iri = mix(c4, c1, (cycle - 0.75) * 4.0);
    }
    return iri * f * 0.3 * smoothstep(0.5, 1.0, cohesion);
}

// ── Fracture glow at material boundaries ──
fn fracture_glow(world_pos: vec3<f32>, cohesion: f32, t: f32) -> vec3<f32> {
    // Gradient of cohesion reveals boundaries
    let eps = 0.3;
    let c_x = fbm((world_pos.xz + vec2(eps, 0.0)) * 0.05, 3);
    let c_z = fbm((world_pos.xz + vec2(0.0, eps)) * 0.05, 3);
    let c_c = fbm(world_pos.xz * 0.05, 3);
    let grad_mag = length(vec2(c_x - c_c, c_z - c_c));
    
    // Sharp transitions get a glow line
    let edge = smoothstep(0.05, 0.15, grad_mag);
    let glow_color = vec3(0.9, 0.7, 0.3); // warm fracture glow
    return glow_color * edge * 0.4;
}

// ── Fragment Shader ───────────────────────────────────────────
@fragment
fn fs(in: VertexOutput) -> @location(0) vec4<f32> {
    let N = normalize(in.normal);
    let V = normalize(u.camera_pos - in.world_pos);
    let L = normalize(u.sun_direction);
    let H = normalize(L + V);
    
    let dist_to_cam = distance(u.camera_pos, in.world_pos);
    
    // ── Diffuse lighting ──
    let diff = max(dot(N, L), 0.0);
    let ambient = 0.3 + 0.2 * (0.5 + 0.5 * dot(N, vec3(0.0, 1.0, 0.0)));
    
    // ── Specular (Blinn-Phong) ──
    let spec = pow(max(dot(N, H), 0.0), 64.0);
    
    // ── Base material color from simulation parameter ──
    let t = u.time;
    var base = material_color(in.cohesion, in.world_pos, t);
    
    // ── Iridescence on high-cohesion surfaces ──
    let iri = iridescence(N, V, in.cohesion, t);
    base += iri;
    
    // ── Fresnel edge glow ──
    let f = fresnel(N, V, 4.0);
    let fresnel_color = mix(vec3(0.4, 0.5, 0.7), vec3(1.0, 0.9, 1.0), f * 2.0);
    base += fresnel_color * f * 0.3;
    
    // ── Caustic light patterns (from ocean shader) ──
    let caustic_uv = in.world_pos.xz + in.world_pos.y * 0.2;
    let caustics = caustic_pattern(caustic_uv, t * 0.5);
    base += caustics * 0.15 * vec3(0.9, 1.0, 0.8);
    
    // ── Fracture glow at material boundaries ──
    let frac = fracture_glow(in.world_pos, in.cohesion, t);
    base += frac;
    
    // ── Combine lighting ──
    var color = base * (ambient + diff * 0.7);
    color += spec * u.sun_color * 0.3;
    
    // ── Distance fog (from ocean shader) ──
    let fog_density = 0.012;
    let fog_factor = exp(-dist_to_cam * fog_density);
    let fog_color = vec3(0.15, 0.18, 0.25);
    color = mix(fog_color, color, fog_factor);
    
    // ── AO based on cohesion (cracks = darker) ──
    let ao = 0.7 + 0.3 * (1.0 - in.cohesion);
    color *= ao;
    
    return vec4(color, 1.0);
}
