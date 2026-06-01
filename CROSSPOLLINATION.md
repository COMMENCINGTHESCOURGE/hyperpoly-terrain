## 🌐 Crosspollination Guide

This engine's core is domain-agnostic. It is substrate-agnostic. The same computational core fertilizes entirely different problem spaces. 

To adapt it:

1. **Map your domain** to the 6-channel tensor (see README table).
2. **Reuse conservation validation**: The thermodynamic mass-conservation check works for any field (e.g., trust budgets in drone swarms, fractional bounding in typography).
3. **Plug in your renderer**: The WebGPU pipeline emits the vertices; your shader interprets them.
4. **Diagnostic layers**: Extend the CHROMA observability schema (Infrared = pre-state, Visible = active execution, Ultraviolet = post-state residue).

### Example: Drone Swarm Adaptation
```python
# Map swarm concepts to tensor channels
SWARM_MAPPING = {
    'density': 'drone_count_per_voxel',
    'cohesion': 'inter_agent_trust_score', 
    'permeability': 'comms_bandwidth_directional',
    'water': 'shared_situational_awareness',
    'sediment': 'memory_decay_rate',
    'oxidation': 'decision_staleness_factor'
}
# Then reuse hyperpoly's erosion kernel as "trust propagation"
```

### The Vinculum Binding Primitive
The mathematical metaphor of the fraction bar (numerator / denominator) maps elegantly as a binding constraint across domains:
- **Terrain**: `water / (density ⊗ permeability)` = saturation potential  
- **Swarm**: `awareness / (trust ⊗ bandwidth)` = coordination capacity  
- **Terraform**: `intent / (state ⊗ policy)` = deployability score  

*Field computation. Not a game engine. A continuity engine.*
