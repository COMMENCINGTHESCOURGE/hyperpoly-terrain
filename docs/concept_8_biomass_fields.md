# Concept 8: Ecosystem Simulation via Biomass Fields

## System Anchoring
This subsystem binds the **Geometric Layer** (WGSL Diffusion Simulator) directly to the **Semantic Substrate**. By representing flora and fauna as concentration fields, we bypass the entity-count bottleneck and allow the *Vinculum Compiler* to treat biomass exactly like terrain channels.

## Tensor Extension
The 6-channel material tensor expands to a 9-channel ecosystem tensor:
1. `density` (Rock/Dirt mass)
2. `cohesion` (Structural integrity)
3. `permeability` (Fluid traversal)
4. `water` (Mobile fluid)
5. `sediment` (Mobile solid)
6. `oxidation` (Chemical age)
7. **`biomass_prey`** (Flora/Fungi/Herbivore concentration)
8. **`biomass_predator`** (Carnivore concentration)
9. **`spore_density`** (Airborne propagation field)

## WGSL Kernel: Lotka-Volterra Diffusion
```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = get_index(id);
    
    let water = state.water[idx];
    let prey = state.biomass_prey[idx];
    let pred = state.biomass_predator[idx];
    
    // 1. Prey Growth (bounded by water/nutrients)
    let prey_growth = params.alpha * prey * min(water, 1.0) - params.beta * prey * pred;
    
    // 2. Predator Growth
    let pred_growth = params.delta * prey * pred - params.gamma * pred;
    
    // 3. Output to State B
    state_out.biomass_prey[idx] = max(0.0, prey + prey_growth * params.dt);
    state_out.biomass_predator[idx] = max(0.0, pred + pred_growth * params.dt);
    
    // 4. Resource Consumption
    state_out.water[idx] = max(0.0, water - prey_growth * params.water_cost * params.dt);
}
```

## Vinculum Dependency Spec (YAML)
```yaml
  ecosystem_lotka_volterra:
    shader: "src/compute/ecosystem.wgsl"
    reads: [water, biomass_prey, biomass_predator]
    writes: [water, biomass_prey, biomass_predator]
    requires: [diffusion, semi_implicit_conservation]
    flux_producer: true
```

## HUD Telemetry Integration
In `hyperpoly_v2.html`, the `eco-prey` and `eco-pred` fields will aggregate the global tensor sum of `biomass_prey` and `biomass_predator` via a rapid GPU parallel reduction pass, feeding directly into the Tournament UI.
