## 📚 Case Study: *From Erosion to Trust*  
### How Conservation Laws Crosspollinate Terrain Simulation → Swarm Coordination

#### 🎯 Problem Statement
> *"How do we ensure trust propagates realistically in a drone swarm — neither vanishing nor inflating artificially — while respecting bandwidth limits and decision decay?"*

This is structurally identical to:  
> *"How do we ensure water/sediment conserves mass during erosion while respecting permeability and oxidation?"*

#### 🔁 Structural Isomorphism

| Terrain Concept | Swarm Analogue | Mathematical Identity |
|----------------|----------------|----------------------|
| Water flow | Awareness propagation | `∂ₜA = ∇·(D∇A) - λA` (advection-diffusion-decay) |
| Sediment deposition | Memory retention | `∂ₜM = κ·(1-M)·A` (saturation-limited accumulation) |
| Permeability tensor | Comms bandwidth matrix | Anisotropic diffusion coefficient `D(x)` |
| Cohesion weight | Trust weight in QEF | Same quadratic form: `xᵀWx` |
| Conservation error | Trust budget drift | `|∫before - ∫after| < ε` |

#### 🛠 Implementation: 3-Line Adaptation

```python
# adapters/swarm/trust_erosion.py
from hyperpoly.core import Field, qef_solve, validate_conservation

def propagate_trust(swarm_state: SwarmState, dt: float) -> SwarmState:
    # 1. Map swarm state → 6-channel tensor (see CROSSPOLLINATION.md table)
    tensor = swarm_state.to_material_tensor()  
    
    # 2. Reuse erosion kernel as trust-diffusion kernel
    updated_tensor = qef_solve(tensor, cohesion_channel=1, permeability_channel=2, dt=dt)  
    
    # 3. Validate trust conservation (no artificial inflation/loss)
    assert validate_conservation(tensor, updated_tensor, tolerance=1e-4)  
    
    return SwarmState.from_material_tensor(updated_tensor)
```

#### 📊 Validation: Same Metric, New Meaning

```python
# Reuse hyperpoly's conservation test suite
def test_trust_budget_preservation():
    before = SwarmState(...).to_field()
    after = propagate_trust(before, dt=0.1)
    assert abs(before.integral() - after.integral()) < 1e-4  # "trust mass" conserved
```

#### 🌐 Outcome
- **Zero new physics**: Reused existing conservation-enforcing solver  
- **Zero new validation**: Reused existing continuity tests  
- **New capability**: Swarm trust now has *provable continuity guarantees*  

#### 🔮 Strategic Impact
This pattern scales:  
- LiDAR calibration → reuse same conservation check for phase coherence  
- Policy simulation → reuse for "intent mass" preservation across governance layers  
- Neural field training → reuse for activation conservation during backprop
