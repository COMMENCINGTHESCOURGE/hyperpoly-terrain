// --- types.wgsl is prepended at compile time ---

// CSG Terraforming Uniforms
struct CSGParams {
    center: vec3<f32>,
    radius: f32,
    strength: f32,
    operation: u32, // 0 = add, 1 = sub, 2 = smooth
};

@group(0) @binding(3) var<uniform> csg_params: CSGParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = get_index(id);
    let voxel = state_in.cells[idx];
    
    // Convert invocation id (Cubemap layout) to spherical direction
    // id.z represents the cubemap face (0-5)
    let uv = vec2<f32>(f32(id.x) / f32(params.grid_size.x), f32(id.y) / f32(params.grid_size.y));
    let dir = face_uv_to_dir(id.z, uv);
    
    // Project to sphere surface (radius = 40.0)
    let pos = dir * 40.0;
    
    let dist = distance(pos, csg_params.center);
    if (dist > csg_params.radius) {
        state_out.cells[idx] = voxel; // No change outside radius
        return;
    }
    
    // Calculate influence field (SDF falloff)
    let influence = (1.0 - (dist / csg_params.radius)) * csg_params.strength * params.dt;
    
    state_out.cells[idx] = voxel; // Copy base
    
    if (csg_params.operation == 0u) {
        // CSG ADD: Increase rock/soil mass, increase terrain stress
        state_out.cells[idx].rock = voxel.rock + influence * 0.8;
        state_out.cells[idx].soil = voxel.soil + influence * 0.2;
        state_out.cells[idx].terrain_stress = voxel.terrain_stress + influence * params.csg_stress_factor;
        
        // Addition buries organic matter
        state_out.cells[idx].biomass_prey = max(0.0, voxel.biomass_prey - influence);
    } 
    else if (csg_params.operation == 1u) {
        // CSG SUBTRACT: Dig through rock/soil/sand, expose water/ice
        state_out.cells[idx].rock = max(0.0, voxel.rock - influence);
        state_out.cells[idx].soil = max(0.0, voxel.soil - influence);
        state_out.cells[idx].sand = max(0.0, voxel.sand - influence);
        
        // Triggers thermal flux if digging exposes ice
        if (voxel.ice > 0.0) {
            state_out.cells[idx].thermal_flux = voxel.thermal_flux + influence * 0.5;
        }
    }
    else if (csg_params.operation == 2u) {
        // CSG SMOOTH (diffusion of terrain_stress)
        // Note: Full smoothing requires neighbor sampling, simplified here to stress relaxation
        state_out.cells[idx].terrain_stress = voxel.terrain_stress * 0.95; 
    }
}
