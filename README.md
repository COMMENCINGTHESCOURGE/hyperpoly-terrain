# hyperpoly-terrain

> Field computation. Not a game engine. A continuity engine.  
> For world-builders who need living terrain, not static meshes.

[![WebGPU](https://img.shields.io/badge/WebGPU-enabled-blue)](https://gpuweb.github.io/gpuweb/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Experimental](https://img.shields.io/badge/status-experimental-orange)](#status)

**hyperpoly-terrain** is a GPU-native, material-first terrain simulation engine. It generates meshes from 6-channel material tensors using cohesion-weighted QEF and conservation-enforcing volumetric simulation — all in WebGPU, with zero host-GPU synchronization.

Part of the **MANIFOLD** field computation system: a continuity engine for worlds that evolve.

---

## 🌍 The MANIFOLD Manifesto

Traditional engines treat worlds as inventories of discrete objects—trees, rocks, water volumes—each synced between GPU and CPU. That atomic model breaks for continuous phenomena like erosion, where every grain influences its neighbor.

Field computation instead simulates the terrain as a unified set of material tensors (elevation, moisture, sediment, six channels total) that evolve entirely on the GPU.

**Example**: rain falls → water flows → terrain softens and hardens — all in a single WebGPU compute pass, zero host-GPU sync.

This serves:
- 🔬 **Researchers** prototyping erosion, sediment transport, or landscape evolution models
- 🎮 **Indie developers** building worlds that breathe, where a raindrop today reshapes a valley tomorrow
- 🎨 **Computational artists** exploring emergent form through physical constraints

---

## 🖼️ Visual Onboarding

*(Placeholders — replace with actual assets)*

| Visual | Purpose | Status |
|--------|---------|--------|
| ![Erosion GIF](./docs/assets/erosion-before-after.gif) | Side-by-side: 10s hydraulic erosion, heightmap before/after | 🟡 TODO |
| ![Architecture](./docs/assets/arch-cpu-gpu.svg) | CPU vs. GPU memory flow: crossed-out "sync" arrow, tensor → compute → QEF mesh | 🟡 TODO |
| ![Tensor Channels](./docs/assets/tensor-6chan.png) | Color-coded slice view: elevation, moisture, sediment, organics, hardness, porosity | 🟡 TODO |
| ![Control Panel](./docs/assets/ui-controls.png) | Real-time sliders: rain intensity, evaporation, thermal weathering | 🟡 TODO |
| ![Performance](./docs/assets/perf-badge.svg) | "10M cells @ 60 fps" + flame graph showing zero CPU stall | 🟡 TODO |

> 💡 **Contributor opportunity**: Help us capture these! See [`CONTRIBUTING.md`](CONTRIBUTING.md) for asset guidelines.

---

## 🚀 Get Started in 5 Minutes

**Requirements**:
- WebGPU-capable browser (Chrome 113+, Edge 113+, or Firefox Nightly with `dom.webgpu.enabled`)
- Node.js 18+

```bash
git clone https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain.git
cd hyperpoly-terrain
npm install && npm run build
```

Then open `game/index.html` → see terrain evolve in real-time.

### 🔧 Quick Controls
| Input | Effect |
|-------|--------|
| `R` | Toggle rain |
| `+` / `-` | Adjust simulation timestep |
| Mouse drag | Rotate camera |
| Scroll | Zoom |

---

## 🧠 Core Concepts

### Material Tensors (6 Channels)
Each voxel stores a 6-channel material vector:
1. **Elevation** (m) — height above datum
2. **Moisture** (0–1) — surface water content
3. **Sediment load** (kg/m²) — suspended particulate mass
4. **Organics** (0–1) — biological material fraction
5. **Rock hardness** (MPa) — resistance to erosion
6. **Porosity** (0–1) — void fraction, affects fluid flow

### Cohesion-Weighted QEF
Mesh extraction uses a modified Quadratic Error Function that respects material cohesion boundaries — preserving cliffs, riverbanks, and stratigraphic layers without manual masking.

### Zero Host-GPU Sync
All simulation state lives on the GPU. No `readBuffer` calls. No frame stalls. The CPU only submits new parameters (e.g., "start rain") — never reads terrain data.

---

## 🤝 Contribute

**Help shape what continuity computing can be.**  
This project is experimental — some edges are sharp, some documentation still lives in WGSL comments. That's where you come in.

👉 See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to get started.

**Good first issues**:
- [ ] Add WGSL comments to `erosion/kernel.wgsl`
- [ ] Write Python validator tests for tensor channel bounds
- [ ] Document the tensor schema in `docs/tensor-spec.md`

No PR is too small. Confusion is valuable feedback — open an issue and say *"I tried this and got stuck."*

---

## 📜 License

MIT © 2026 DaShawn McLaughlin / Guinea Pig Trench LLC

---

## 🔗 Part of MANIFOLD

- [`trench-builder`](https://github.com/COMMENCINGTHESCOURGE/trench-builder) — Open-world integration demo
- [`sovereign-resonance-node`](https://github.com/COMMENCINGTHESCOURGE/sovereign-resonance-node) — WebGL planet avatar + live pipeline HUD
- [`erdos-straus-solver`](https://github.com/COMMENCINGTHESCOURGE/erdos-straus-solver) — Mathematical utility for integer field constraints

> *"Continuity is not a feature. It's the foundation."*
