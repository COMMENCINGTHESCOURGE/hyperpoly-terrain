# Vinculum Operator Spec: Dependency Graph DSL

> *"Safe, decentralized tensor updates require strict causal ordering. Vinculum enforces the graph."*

The Vinculum Scheduler is the core mechanism that prevents data races when multiple compute kernels (erosion, thermal weathering, biome growth, swarms) attempt to modify the 6-channel material tensor simultaneously.

## The DSL Schema (YAML)

Pipeline execution is defined via a `vinculum.yml` graph. Kernels declare their read/write channels, and the compiler builds a conflict-free execution DAG.

```yaml
version: "1.0"
pipeline: "manifold_standard_erosion"

channels:
  - id: 0
    name: "Density"
  - id: 1
    name: "Cohesion"
  - id: 2
    name: "Permeability"
  - id: 3
    name: "Water"
  - id: 4
    name: "Sediment"
  - id: 5
    name: "Oxidation"

operators:
  - name: "hydraulic_erosion"
    kernel: "erosion/hydraulic.wgsl"
    reads:  ["Density", "Cohesion", "Water", "Sediment"]
    writes: ["Cohesion", "Water", "Sediment"]
    cost_estimate: 450 # arbitrary compute units for load balancing

  - name: "thermal_weathering"
    kernel: "weathering/thermal.wgsl"
    reads:  ["Density", "Cohesion"]
    writes: ["Cohesion", "Oxidation"]
    cost_estimate: 200

  - name: "sediment_compaction"
    kernel: "geology/compaction.wgsl"
    reads:  ["Sediment", "Density", "Cohesion"]
    writes: ["Density", "Cohesion", "Sediment"]
    cost_estimate: 300

execution:
  # The Vinculum compiler will automatically deduce that 'hydraulic_erosion' 
  # and 'thermal_weathering' CANNOT run in parallel because they both mutate 'Cohesion'.
  # It will construct the following safe execution sequence:
  # 1. hydraulic_erosion
  # 2. thermal_weathering
  # 3. sediment_compaction (Depends on updated Cohesion and Sediment)
```

## Compiler Rules
1. **Zero Data Races:** If Operator A and Operator B both write to channel `N`, they cannot be scheduled in the same parallel dispatch group.
2. **Mass Conservation Check:** If an operator mutates the mobile phases (`Water`, `Sediment`), the scheduler automatically injects the `semi_implicit_conservation.wgsl` pass immediately after it.
3. **Ghost Voxel Resolution:** At the end of every complete dispatch frame, the Vinculum scheduler triggers a tile boundary sync (resolving `boundary_flux`).
