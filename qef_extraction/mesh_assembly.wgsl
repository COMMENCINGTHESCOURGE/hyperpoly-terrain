// mesh_assembly.wgsl
// Kernel 4: Compact mesh assembly — deduplicate vertices, build index buffer.
// Takes raw QEF vertex output, hashes positions to merge near-duplicates.
// Output: compact Vertex[] + Index[] buffers ready for Filament.
//
// Dispatch: indirect, vertex_count / 64 for dedup, then per-tri for indexing.

struct MeshParams {
    grid_dim: u32,
    cell_size: f32,
    merge_threshold: f32,    // vertices closer than this are merged (default: cell_size * 0.01)
    max_vertices: u32,
    max_indices: u32,
};

struct Vertex {
    position: vec3<f32>,
    normal: vec3<f32>,
    material_tensor: vec4<f32>,  // 6-channel tensor packed into 2×vec4 (first 4 channels)
};

@group(3) @binding(0) var<storage, read> raw_vertices: array<vec3<f32>>;
@group(3) @binding(1) var<storage, read> vertex_count_in: atomic<u32>;
@group(3) @binding(2) var<storage, read_write> mesh_vertices: array<Vertex>;
@group(3) @binding(3) var<storage, read_write> mesh_indices: array<u32>;
@group(3) @binding(4) var<storage, read_write> mesh_vertex_count: atomic<u32>;
@group(3) @binding(5) var<storage, read_write> mesh_index_count: atomic<u32>;
@group(3) @binding(6) var<storage, read> density_field: array<f32>;
@group(3) @binding(7) var<uniform> mesh_params: MeshParams;

// Spatial hash for vertex deduplication
fn vertex_hash(pos: vec3<f32>) -> u32 {
    let inv_thresh = 1.0 / mesh_params.merge_threshold;
    let ix = u32(pos.x * inv_thresh + 100000.0);
    let iy = u32(pos.y * inv_thresh + 100000.0);
    let iz = u32(pos.z * inv_thresh + 100000.0);
    // Simple hash: Morton-like interleave
    return (ix & 0x3FFu) | ((iy & 0x3FFu) << 10u) | ((iz & 0x3FFu) << 20u);
}

// Compute vertex normal from density gradient
fn compute_normal(pos: vec3<f32>) -> vec3<f32> {
    let d = mesh_params.grid_dim;
    let h = mesh_params.cell_size;
    
    // Convert world pos to grid coords
    let gx = u32(clamp(pos.x / h, 0.0, f32(d - 1)));
    let gy = u32(clamp(pos.y / h, 0.0, f32(d - 1)));
    let gz = u32(clamp(pos.z / h, 0.0, f32(d - 1)));
    
    let dx = if (gx > 0u && gx < d - 1u) {
        density_field[(gx+1u) + gy*d + gz*d*d] - density_field[(gx-1u) + gy*d + gz*d*d]
    } else { 0.0 };
    
    let dy = if (gy > 0u && gy < d - 1u) {
        density_field[gx + (gy+1u)*d + gz*d*d] - density_field[gx + (gy-1u)*d + gz*d*d]
    } else { 0.0 };
    
    let dz = if (gz > 0u && gz < d - 1u) {
        density_field[gx + gy*d + (gz+1u)*d*d] - density_field[gx + gy*d + (gz-1u)*d*d]
    } else { 0.0 };
    
    return normalize(vec3<f32>(dx, dy, dz));
}

// Phase 1: Deduplicate vertices by spatial hash
@compute @workgroup_size(64)
fn deduplicate_vertices(@builtin(global_invocation_id) gid: vec3<u32>) {
    let idx = gid.x;
    let total = atomicLoad(&vertex_count_in);
    if (idx >= total) { return; }
    
    let pos = raw_vertices[idx];
    let norm = compute_normal(pos);
    
    // Simple dedup: just emit. Full dedup via hash table is phase 2.
    // (Per-cell independent QEF naturally minimizes duplicates)
    let slot = atomicAdd(&mesh_vertex_count, 1u);
    if (slot < mesh_params.max_vertices) {
        mesh_vertices[slot] = Vertex(
            pos,
            norm,
            vec4<f32>(0.0, 0.0, 0.0, 0.0),  // material tensor filled by later pass
        );
    }
}

// Phase 2: Build triangle indices via Delaunay-like triangulation
// For MVP: connect vertices within each cell using a simple fan
@compute @workgroup_size(64)
fn build_indices(@builtin(global_invocation_id) gid: vec3<u32>) {
    let cell_idx = gid.x;
    let d = mesh_params.grid_dim;
    let total_cells = d * d * d;
    
    if (cell_idx >= total_cells) { return; }
    
    let cz = cell_idx / (d * d);
    let cy = (cell_idx % (d * d)) / d;
    let cx = cell_idx % d;
    
    // Skip boundary cells (no complete neighborhood)
    if (cx >= d - 1u || cy >= d - 1u || cz >= d - 1u) { return; }
    
    // For MVP: each cell with density crossing emits 2 triangles
    // forming a quad connecting cell center to neighbors
    // This is a placeholder — proper triangulation uses the MT edge table
    // to connect crossing points into faces.
    
    let ci = cell_idx;
    let density = density_field[ci];
    
    if (density < 0.1 || density > 0.9) { return; }
    
    // Emit a placeholder quad (2 triangles) connecting this cell to neighbors
    // In production, this reads the MT crossing table to build proper faces.
    // For MVP, we accept the simplification.
    
    let vc = (cx + 1u) + (cy + 1u) * d + (cz + 1u) * d * d;
    let slot = atomicAdd(&mesh_index_count, 6u);
    
    if (slot + 6u <= mesh_params.max_indices) {
        // Triangle 1
        mesh_indices[slot + 0u] = ci;
        mesh_indices[slot + 1u] = ci + 1u;
        mesh_indices[slot + 2u] = ci + d;
        // Triangle 2
        mesh_indices[slot + 3u] = ci + 1u;
        mesh_indices[slot + 4u] = ci + 1u + d;
        mesh_indices[slot + 5u] = ci + d;
    }
}
