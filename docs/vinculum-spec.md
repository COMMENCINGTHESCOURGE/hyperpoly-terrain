# vinculum-spec.md — MANIFOLD Dependency Graph Schema
# Version: 0.1.0
# Purpose: Declare compute module dependencies, channel I/O, and compiler injection rules

version: "0.1.0"
engine: "hyperpoly-terrain"
channels:
  - rock
  - soil
  - sand
  - water
  - ice
  - organic

# Module registry: each compute pass declares its I/O contract
modules:
  advection:
    shader: "src/compute/advection.wgsl"
    reads: [water, sand, soil]
    writes: [water, sand]
    flux_producer: true  # marks this module as generating flux_in/flux_out
    injection_points: [pre-conservation]

  diffusion:
    shader: "src/compute/diffusion.wgsl"
    reads: [rock, soil, sand, water, ice, organic]
    writes: [soil, sand]
    requires: [advection]
    flux_producer: false

  semi_implicit_conservation:
    shader: "src/compute/semi_implicit_conservation.wgsl"
    reads: [water, sand]  # minimal: only channels that were written
    writes: [water, sand, soil, rock, ice, organic]  # renormalization touches all
    requires: [advection, diffusion]  # must run after any flux_producer and modifiers
    injection_rule: "auto-on-write"  # compiler injects when water/sand are mutated

  qef_extract:
    shader: "src/compute/qef_solve.wgsl"
    reads: [rock, soil, sand, water, ice, organic]
    writes: []  # read-only: generates mesh, doesn't mutate tensor
    depends_on_state: "post-conservation"

# Global compiler rules
compiler:
  race_detection:
    strategy: "static-dag"  # build dependency DAG at compile-time
    conflict_resolution: "fail-fast"  # reject specs with write-write conflicts on same channel
  injection:
    auto_conserve: true  # inject semi_implicit_conservation after any flux_producer writes water/sand
    substep_hint: "high-flux"  # suggest adaptive substepping when flux_out > threshold
  optimization:
    fuse_reads: true  # coalesce multiple reads of same channel into single buffer fetch
    prune_unused: true  # remove modules whose outputs aren't consumed downstream
