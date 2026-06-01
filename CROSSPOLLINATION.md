# 🌐 Crosspollination Guide

> *"Field computation. Not a game engine. A continuity engine."*

This engine's core is **substrate-agnostic**. The same computational primitives that simulate terrain erosion can model swarm coordination, LiDAR calibration, or policy propagation — with minimal adaptation.

## 🔑 Core Abstraction

```
[6-Channel Material Tensor] 
  → [Cohesion-Weighted QEF Solver] 
  → [Conservation-Enforcing Volumetric Update] 
  → [Mesh/Field Emission]
```

Each stage is domain-interpretive. Your job: **map your domain's semantics onto the tensor channels**.

## 🗺️ Channel Mapping Template

| Channel | Terrain Semantics | Your Domain Semantics |
|---------|------------------|----------------------|
| `0` | Density | *e.g., agent count / signal strength* |
| `1` | Cohesion | *e.g., trust score / phase coherence* |
| `2` | Permeability | *e.g., comms bandwidth / policy flexibility* |
| `3` | Water (mobile phase) | *e.g., situational awareness / data flow* |
| `4` | Sediment (deposited) | *e.g., memory retention / institutional knowledge* |
| `5` | Oxidation (decay) | *e.g., decision staleness / entropy factor* |

## ♻️ Reuse Patterns

### 1. Conservation Validation (Any Domain)
```python
# checker/conservation_test.py — works out-of-the-box
def validate_field_continuity(before: Field, after: Field, tolerance: float = 1e-5) -> bool:
    """Asserts mass/energy/trust/awareness is neither created nor destroyed beyond tolerance."""
    return abs(before.integral() - after.integral()) < tolerance
```

### 2. Diagnostic Spectral Layers (CHROMA)
Extend `dashboard/chroma_layers.py` with your domain's IR/UV signals:
```python
class MyDomainLayers(ChromaDiagnostic):
    def infrared(self, field: Field) -> Metric:
        return field.channel[1].mean()  # pre-state cohesion/trust
    def ultraviolet(self, field: Field) -> Metric:
        return field.conservation_error()  # post-state residue
```

### 3. QEF as Constraint Solver
The cohesion-weighted QEF isn't just for meshing — it's a **generalized constraint optimizer**:
```rust
// Reuse in swarm coordination:
fn resolve_agent_positions(
    desired: &[Vec3], 
    trust_weights: &[f32],  // ← cohesion channel
    bandwidth_limits: &[f32] // ← permeability channel
) -> Vec<Vec3> {
    qef_solve(desired, trust_weights, bandwidth_limits) // same kernel
}
```

## 🌱 Example Adaptations

### Drone Swarm Trust Propagation
```python
SWARM_TENSOR = {
    'density': 'agents_per_voxel',
    'cohesion': 'inter_agent_trust_score', 
    'permeability': 'directional_comms_capacity',
    'water': 'shared_situational_awareness',
    'sediment': 'collective_memory_retention',
    'oxidation': 'decision_decay_rate'
}
# Then reuse hyperpoly's erosion kernel as "trust diffusion"
```

### LiDAR Phase-Coherence Calibration
```python
LIDAR_TENSOR = {
    'density': 'point_density',
    'cohesion': 'phase_alignment_score',
    'permeability': 'sensor_fusion_weight',
    'water': 'temporal_consistency_flow',
    'sediment': 'calibration_anchor_strength',
    'oxidation': 'drift_accumulation'
}
# QEF becomes "coherence-optimal surface reconstruction"
```

## 🤝 Contributing a New Domain

1. Fork `hyperpoly-terrain`  
2. Add `adapters/<your_domain>/` with:  
   - `tensor_mapping.py` (your channel semantics)  
   - `validation_rules.py` (domain-specific conservation laws)  
   - `render_shader.wgsl` (optional visual interpretation)  
3. Submit a PR with a `CROSSPOLLINATION_EXAMPLE.md` showing before/after metrics  

We'll help you integrate. The core stays stable; your domain extends it.

---

*Crosspollination isn't a feature — it's the architecture.*  
*If your domain has fields, flows, and constraints, this engine can simulate it.*
