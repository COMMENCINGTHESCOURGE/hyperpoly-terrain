// Tensor Mapping v2.0
// 12 Channels, 48-byte Stride

struct Tensor12 {
    // Channels 0-5: Conservative (consume/produce constraints)
    rock: f32,
    soil: f32,
    sand: f32,
    water: f32,
    ice: f32,
    organic: f32,
    
    // Channels 6-10: Additive (commutative deltas)
    biomass_prey: f32,
    biomass_pred: f32,
    spore_density: f32,
    terrain_stress: f32,
    thermal_flux: f32,
    
    // Channel 11: WebGPU Alignment Padding
    _pad: f32,
};

// Simulation state layout
struct SimState {
    cells: array<Tensor12>,
};

// Global bindings
@group(0) @binding(0) var<storage, read> state_in: SimState;
@group(0) @binding(1) var<storage, read_write> state_out: SimState;

// Uniform parameters
struct SimParams {
    grid_size: vec3<u32>,
    dt: f32,
    // Additive parameter slots
    alpha: f32,
    beta: f32,
    gamma: f32,
    delta: f32,
    water_cost: f32,
    csg_stress_factor: f32,
};

@group(0) @binding(2) var<uniform> params: SimParams;

fn get_index(id: vec3<u32>) -> u32 {
    return id.x + id.y * params.grid_size.x + id.z * params.grid_size.x * params.grid_size.y;
}
