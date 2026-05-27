# hyperpoly-terrain

**Part of the MANIFOLD field computation system.**  
**Copyright (c) 2026 Guinea Pig Trench LLC**

---

GPU-native material-first terrain simulation engine. Real-time erosion, fluid dynamics, collision, and feature-preserving mesh extraction. WebGPU, zero host-GPU sync.

## Architecture

This is a **field computation system** that demos terrain. The same architecture calibrates LiDAR arrays, coordinates drone swarms, and documents legal cases. See [the domain-agnostic reference](https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain/wiki) for mapping the 6-channel tensor to your domain.

### The 6-Channel Tensor

| Channel | Terrain Interpretation | LiDAR Interpretation | Swarm Interpretation |
|---------|----------------------|---------------------|---------------------|
| density | Voxel occupancy | Optical power density | Drone density |
| cohesion | Rock integrity | Phase coherence | Inter-agent trust |
| permeability | Fluid flow (directional) | Atmospheric transmission | Communication bandwidth |
| water | Groundwater saturation | Water vapor / turbulence | Shared awareness |
| sediment | Erosion product | Particulate scattering | Memory decay |
| oxidation | Weathering rate | Thermal gradient | Decision staleness |

## Quick Start

```bash
# Requires browser with WebGPU support
git clone https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain.git
# Open index.html in Chrome/Edge
```

## Validation

Rainfall pulse validation confirms:
- Mass drift < 0.001% over 50 ticks
- Queue compaction produces no duplicate or OOB indices
- Wetting front propagates at Darcy velocity
- Dual-mode testing: JS proxy (algorithmic) + GPU (real WGSL)

## Entity

| Field | Value |
|-------|-------|
| Copyright | Guinea Pig Trench LLC |
| R&D Entity | Guinea Pig Trench LLC (PA, #13674084) |
| Credit Facility | Truth Holds Enterprise (PA, #7049023) |

## Related

- `trench-builder` — Open world integration demo
- [Domain-agnostic reference](https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain/wiki)
