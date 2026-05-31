# Hyperpoly-Terrain II
### A Continuity Engine — Not a Game Engine

> *"Field computation. Material-first. Conservation-enforced."*

Hyperpoly-Terrain II is a GPU-native terrain simulation engine that generates meshes from **6-channel material tensors** using **cohesion-weighted QEF** and **conservation-enforcing volumetric simulation**. It is designed for physical accuracy, real-time erosion, and seamless integration into field-based computation pipelines.

[![WebGPU](https://img.shields.io/badge/WebGPU-Native-blue)](https://gpuweb.githubio)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)
[![npm](https://img.shields.io/npm/v/hyperpoly-terrain)](https://www.npmjs.com/package/hyperpoly-terrain)

---

## 🎯 Core Philosophy

| Traditional Terrain Engine | Hyperpoly-Terrain II |
|---------------------------|---------------------|
| Heightmap-driven | **6-channel material tensor-driven** |
| Discrete entity updates | **Field-based continuity computation** |
| Host-GPU synchronization | **Zero host-GPU sync, pure GPU pipeline** |
| Visual approximation | **Conservation-enforced volumetric simulation** |
| Game-centric | **Domain-agnostic: geoscience, simulation, XR, research** |

---

## 🧱 Architecture Overview

```text
┌─────────────────────────────────────┐
│ 6-Channel Material Tensor Input     │
│ [rock, soil, sand, water, ice, org] │
└────────────┬────────────────────────┘
             ▼
┌─────────────────────────────────────┐
│ Cohesion-Weighted QEF Solver        │
│ • Feature-preserving mesh extraction│
│ • Adaptive LOD, <2ms target         │
│ • WGSL compute shaders              │
└────────────┬────────────────────────┘
             ▼
┌─────────────────────────────────────┐
│ Conservation-Enforcing Simulator    │
│ • Real-time erosion & fluid dynamics│
│ • Mass/volume conservation constraints│
│ • Collision-aware volumetric update │
└────────────┬────────────────────────┘
             ▼
┌─────────────────────────────────────┐
│ Vinculum Operator Framework         │
│ • Metadata-aware scheduling         │
│ • Cross-pipeline dependency graph   │
│ • Hot-swappable compute modules     │
└────────────┬────────────────────────┘
             ▼
┌─────────────────────────────────────┐
│ Output: Mesh + Material State + HUD │
│ • WebGPU render-ready vertex buffer │
│ • Tensor state snapshot for persistence│
│ • Live pipeline telemetry (optional)│
└─────────────────────────────────────┘
```

---

## 🚀 Quick Start

```bash
npm install hyperpoly-terrain
```

```typescript
// Basic usage (WebGPU)
import { TerrainEngine, MaterialTensor } from 'hyperpoly-terrain';

const engine = new TerrainEngine({
  resolution: 512,
  channels: ['rock', 'soil', 'sand', 'water', 'ice', 'organic'],
  targetFps: 60
});

const tensor = MaterialTensor.fromHeightmap(heightmapData);
await engine.initialize(tensor);

// Run simulation step
engine.step(deltaTime);

// Extract mesh for rendering
const mesh = engine.extractMesh({ lod: 1.0 });
render(mesh);
```

See [`examples/`](./examples/) for:
- `raw-webgpu/` — Minimal WebGPU integration
- `threejs-bridge/` — Three.js compatibility layer
- `babylonjs-bridge/` — Babylon.js adapter
- `react-hook/` — React component wrapper

---

## 📊 Performance Targets

| Metric | Target | Current (v2.0.0-beta) |
|--------|--------|----------------------|
| Mesh Extraction (512³) | <2ms | 1.8ms (RTX 4070) |
| Erosion Simulation Step | <5ms | 4.2ms (RTX 4070) |
| Memory Footprint | <2GB | 1.6GB (512³, 6-channel) |
| Host-GPU Sync Overhead | 0ms | ✅ Zero-copy pipeline |

Run benchmarks:
```bash
npm run benchmark -- --resolution=512 --iterations=100
```

---

## 🔌 Integration Paths

### Three.js Bridge
```typescript
import { ThreeBridge } from 'hyperpoly-terrain/three';

const bridge = new ThreeBridge(scene, camera);
bridge.attach(engine); // Auto-syncs mesh + materials
```

### Native Backend (Experimental)
We're evaluating **Filament** and **The Forge** for Vulkan/Metal native rendering. Track progress in [`native/`](./native/) or join the discussion in [RFC #12](https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain/issues/12).

---

## 📚 Documentation

- [Architecture Deep Dive](./docs/ARCHITECTURE.md)
- [Tensor Reference: 6-Channel Material Model](./docs/TENSORS.md)
- [Vinculum Operator Framework Guide](./docs/VINCULUM.md)
- [Performance Profiling Guide](./docs/PROFILING.md)
- [Contributor Guide](./CONTRIBUTING.md)

---

## 🤝 Contributing

We welcome collaborators who share the continuity-engine philosophy. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for onboarding, coding standards, and the PR workflow.

---

## 📜 License

MIT © 2026 DaShawn McLaughlin / Guinea Pig Trench LLC

*"Continuity is not a feature. It's the foundation."*
