// --- types.wgsl is prepended at compile time ---

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = get_index(id);
    
    // Read state
    let voxel = state_in.cells[idx];
    let water = voxel.water;
    let organic = voxel.organic;
    let prey = voxel.biomass_prey;
    let pred = voxel.biomass_pred;
    let spores = voxel.spore_density;
    
    // 1. Prey Growth (bounded by water/organic nutrients)
    let carrying_capacity = min(water, organic);
    let prey_growth = params.alpha * prey * carrying_capacity - params.beta * prey * pred;
    
    // 2. Predator Growth
    let pred_growth = params.delta * prey * pred - params.gamma * pred;
    
    // 3. Spore Generation (based on prey/flora density)
    let spore_gen = prey * 0.05 - spores * 0.01; // Decay rate
    
    // 4. Output to State B
    // Copy all first, then overwrite mutated
    state_out.cells[idx] = voxel;
    
    state_out.cells[idx].biomass_prey = max(0.0, prey + prey_growth * params.dt);
    state_out.cells[idx].biomass_pred = max(0.0, pred + pred_growth * params.dt);
    state_out.cells[idx].spore_density = max(0.0, spores + spore_gen * params.dt);
    
    // 5. Resource Consumption (Conservative feedback)
    state_out.cells[idx].water = max(0.0, water - prey_growth * params.water_cost * params.dt);
    
    // Biomass retention feedback on organic channel
    if (prey > 0.6) {
        state_out.cells[idx].organic = organic + 0.01 * params.dt;
    }
}
