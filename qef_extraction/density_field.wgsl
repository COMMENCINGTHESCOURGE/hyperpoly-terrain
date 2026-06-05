// density_field.wgsl
// Kernel 1: Convert particle positions to 64³ density field.
// Reads spatial_hash.wgsl grid, writes density scalar per cell.
//
// Dispatch: (64, 64, 1) workgroups of (1, 1, 64) — one thread per z-slice.

struct DensityParams {
    grid_dim: u32,            // 64
    max_particles_per_cell: u32,
    particle_radius: f32,     // for density falloff
};

@group(0) @binding(0) var<storage, read> grid_heads: array<atomic<i32>>;
@group(0) @binding(1) var<storage, read> grid_next: array<atomic<i32>>;
@group(0) @binding(2) var<storage, read> particle_positions: array<vec3<f32>>;
@group(0) @binding(3) var<storage, read_write> density_field: array<f32>; // 64³ = 262,144
@group(0) @binding(4) var<uniform> params: DensityParams;

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let cx = gid.x;
    let cy = gid.y;
    let cz = gid.z;
    
    if (cx >= params.grid_dim || cy >= params.grid_dim || cz >= params.grid_dim) {
        return;
    }
    
    let cell_idx = cx + cy * params.grid_dim + cz * params.grid_dim * params.grid_dim;
    
    // Count particles in this cell by walking linked list
    var count = 0u;
    var curr = atomicLoad(&grid_heads[cell_idx]);
    
    while (curr >= 0 && count < params.max_particles_per_cell) {
        count++;
        let n_idx = u32(curr);
        curr = atomicLoad(&grid_next[n_idx]);
    }
    
    // Normalize: density = count / max (capped at 1.0)
    let density = f32(count) / f32(params.max_particles_per_cell);
    density_field[cell_idx] = density;
}
