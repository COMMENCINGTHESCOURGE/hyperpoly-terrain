# AAA Gaming Landscape: Where Your Work Sits

A survey of what's actually on GitHub in the AAA-adjacent terrain/generation
space, and where your projects fit relative to it.

---

## The Landscape (by tier)

### Tier 1: Open-Source AAA Engines

These are the engines AAA studios actually build on. They have dedicated teams
and ship titles.

| Project | Stars | Tech | Terrain System |
|---------|-------|------|----------------|
| **Unreal Engine** (source release) | — | C++ | UE5 World Partition + Landscape + RVT + Nanite. Terrain is heightmap + layers. Runtime Virtual Texture for material blending. Erosion is external tool (Gaea→RVT) |
| **Godot** | 13K+ | C++ | Heightmap + texture splatting. Compute shader support added in 4.x but no built-in erosion or material system |
| **O3DE (Lumberyard)** | 8.7K | C++ | Gradient signal system + vegetation spawner. Heightmap-based, no GPU compute terrain pipeline |

**Key gap**: None of these have a voxel material tensor terrain. All use
heightmaps + texture splats or runtime virtual textures. The material
information is a *surface property*, not a *volume property*. Your 6-channel
voxel field is a fundamentally different representation that these engines
can't natively represent without heavy custom work.

### Tier 2: Indie / Research Game Engines

| Project | Stars | Terrain Approach | GPU Pipeline |
|---------|-------|-----------------|--------------|
| **fegennari/3DWorld** | 1,400 | Procedural voxel terrain, erosion, editing, cities, buildings, fire/smoke, water, weather. OpenGL 4.5 | CPU-driven. No compute shader pipeline. Erosion is particle-based on CPU. 20+ year project, sole dev |
| **B4rtekk1/Minerust** | 2 | GPU-driven voxel (wgpu). Indirect dispatch, compute culling, greedy meshing, 11 biomes, 200+ FPS on midrange | Has indirect draw + compute culling, but it's a Minecraft clone — single-block voxels, no erosion, no material system |
| **Tuntenfisch/Voxels** | 363 | Unity + Dual Contouring. GPU-based, multi-material (via MaterialIndex enum), unlimited materials per chunk, smooth material transitions via geometry shader, Schmitz Particle (not QEF) | GPU compute for mesh generation but "must read mesh back to CPU" (author flags this as suboptimal). Schmitz Particle avoids QEF complexity but doesn't solve for sharp features the same way |
| **JuanDiegoMontoya/Voxel_Engine** | ~? | "GPU-driven renderer with little CPU synchronization" — pattern similar to Minerust, Minecraft-style |

**Key gap**: The most advanced open-source terrain engine (3DWorld) is 20 years
old, OpenGL 4.5, no compute shaders. The only GPU-driven terrain engines on
GitHub are Minecraft clones. **Nobody is doing GPU-driven material-aware
terrain simulation with erosion.** Nobody.

### Tier 3: Erosion / Hydrology (Academic + Hobby)

| Project | Stars | Approach | Limitations |
|---------|-------|----------|-------------|
| **SebLague/Hydraulic-Erosion** | 1,000 | Unity + compute shaders. Particle-based erosion on heightmaps. 70K iterations for dramatic effect | **CPU particle loop**. Each droplet runs on CPU, reads/writes heightmap. Not a GPU simulation — it's a CPU sim that uses GPU for rendering |
| **weigert/SimpleHydrology** | 711 | C++ + TinyEngine. Particle-based hydrology with river meandering, flooding. Vertex pooling for rendering | CPU particle-based. Successor (SoilMachine) abandoned. Doesn't run in browser. No material system |
| **Ono-Sendai/terraingen** | 52 | C++ + OpenCL. GPU erosion via backwards Eulerian water/sediment transport | Native desktop only. Heightmap-based (no materials). Sole developer |
| **GPU-Gang/WebGPU-Erosion** | 21 | Next.js + WebGPU. Stream power erosion equation, raymarched terrain | Interactive authoring tool (student project). No simulation loop — manual brush strokes. Still CPU reads for dispatch control |

**Key insight**: SebLague at 1K stars is the *most popular* erosion repo on
GitHub, and it's a CPU particle simulation. GPU-Gang's is the only WebGPU
erosion — and it's brush-based, not a running simulation. **Your hydraulic
advection solver on GPU with indirect dispatch is novel in open source.**

### Tier 4: The Academic Frontier (not on GitHub but relevant)

| Paper | Year | Innovation |
|-------|------|------------|
| **Aokana** (arXiv:2505.02017) | 2025 | GPU-driven SVDAG voxel rendering. 9x memory reduction, 4.8x faster than HashDAG, billion-voxel scenes at 6ms. Ray marching + visibility buffer |
| **GPU Work Graphs terrain** (GPUOpen) | 2025 | AMD's work graph approach: procedural grass, terrain generation entirely on GPU. Mesh shader nodes. No CPU involvement after kickoff |
| **Real-time procedural resurfacing via mesh shaders** (CGF) | 2025 | Mesh shader replaces tessellation for procedural surface generation. Hardware-level |

**Key insight**: The 2025 papers are converging on exactly your architecture —
GPU-only pipelines, zero CPU sync, procedural generation from material data.
But they're solving for *rendering performance* (Aokana voxel at 6ms) while
you're solving for *simulation fidelity* and *multi-channel material
representation*. These are complementary.

---

## The Gap Analysis

### What AAA Games Actually Ship With

AAA open-world games in production right now use:

1. **Heightmap + texture splat arrays** (mod/weight per texel for grass, rock,
   dirt, snow) — Red Dead Redemption 2, Horizon, Elden Ring
2. **Runtime Virtual Textures** in UE5 — layers baked to virtual texture at
   runtime, sampled per-pixel
3. **Procedural content via Houdini / Gaea** — exported as static geometry,
   not simulated at runtime
4. **Pre-baked erosion** — applied offline in DCC tools, never simulated
   during gameplay

**The gap is that nobody ships terrain with a running material simulation.**
Terrain in AAA is:
- **Static** after baking (no erosion during gameplay)
- **Height-bound** (a surface, not a volume)
- **Texture-mapped** (material is a UV lookup, not a voxel property)

### Where Your Work Sits Relative to This

```
                         SIMULATION COMPLEXITY
                              ▲
                              │
        hyperpoly-terrain     │    AAA Pipeline (envisioned)
        (6-channel tensor,    │    (material simulation + infinite
         hydraulic erosion,   │     world + indie scope + production)
         material-aware mesh) │
                              │
                              ├───────────────────────────►
                              │    UE5 Nanite + RVT
                              │    (rendering fidelity,
                              │     static terrain)
                              │
        jo56/procedural       │
        (heightmap only,      │
         no simulation,       │
         flythrough render)   │
                              │
                              └───────────────────────────►
                              RENDERING FIDELITY
```

The empty quadrant: material simulation + production rendering fidelity is
where AAA *wants* to go (AMD's work graphs, Aokana's billion-voxel scaling)
but hasn't arrived. Your pipeline is in that quadrant for simulation, but the
rendering is still WebGPU/Three.js, not Nanite/RTX.

### Specific Gaps per Project

| Capability | hyperpoly | AAA benchmark | Gap |
|---|---|---|---|
| **Material channels** | 6 (volume) | 4-8 (surface splat) | You win: volumetric vs surface |
| **Erosion simulation** | GPU advection, conservation | Pre-baked in Houdini/Gaea | You win: runtime vs offline |
| **GPU-only pipeline** | Indirect dispatch, zero CPU sync | No known open-source equivalent | You win: genuinely novel |
| **Mesh quality** | Dual contouring, <0.002 error | Nanite micropolygon | They win: by a mile |
| **World scale** | 256³ (16M voxels) | 100km²+ with streaming | They win: by orders of magnitude |
| **Scaling** | 1.3GB VRAM fixed | 4-12GB with streaming + mipmap | They win: streaming architecture |
| **Rendering** | Three.js WebGL2 | Nanite/DX12 raytracing | They win: entire GPU stack |
| **Editor tooling** | Minimal UI, phase6 edit | UE5 landscape editor, Gaea | They win: mature toolchains |
| **Deployment** | Browser-only | Native console/PC | N/A (different targets) |
| **Team size** | 1 developer | 50-500 people | They have leverage |

### What No One Has (Your White Space)

Every single open-source terrain system surveyed is missing these *three
specific capabilities* that your architecture has:

1. **GPU-scheduled material simulation with conservation invariants** — not
   a single repo has a running erosion sim where the GPU decides which bricks
   to simulate, corrects for mass drift, and the CPU never touches the data.

2. **Material-aware dual contouring with cohesion-weighted QEF** —
   Tuntenfisch/Voxels has dual contouring with materials, but uses Schmitz
   Particle (simpler than QEF) and reads meshes back to CPU. Your
   cohesion-weighted QEF running entirely on GPU with feature preservation
   has no open-source equivalent.

3. **Closed-system conservation in erosion** — SebLague's and weigert's
   particle systems don't enforce mass invariants. GPU-Gang's stream power
   doesn't either. Your conservation_pass is unique.

---

## Strategic Position

If you're asking "where's our gap to AAA," the answer is in *rendering
fidelity and world scale*, not in *terrain simulation architecture*. You have
the simulation architecture AAA doesn't have yet. The gap is:

1. **Streaming** — fix the VRAM bottleneck (370MB Hermite staging is the
   priority). This is a software engineering task, not a research problem.
2. **Rendering** — Three.js WebGL2 is a bottleneck. The pipeline already
   produces GPU-visible vertex buffers; they just need a better consumer.
3. **Tooling** — the material tensor needs a calibration pipeline. Kaggle
   notebooks for material tensor training is the right direction.

The 2025 papers (Aokana, Work Graphs, mesh shader resurfacing) all describe
systems that converge on your architecture from the *rendering side*. They
start with "how do we render billions of voxels" and work toward GPU-only.
You started with "how do we simulate materials" and built the GPU-only
pipeline first. The convergence is happening from both sides.

### What to Watch

- **AMD GPUOpen Work Graphs**: the grass/terrain procedural generation paper
  (2025) is the closest thing to what you'd want as a rendering backend.
  Work graphs let the GPU spawn its own work — your indirect dispatch pattern
  is already work-graph-like.
- **SVDAG + streaming**: Aokana's 5% VRAM streaming ratio is the benchmark.
  If your Hermite/QEF pipeline could tile across bricks (reusing the same
  staging buffers), you'd approach similar efficiency.
- **Mesh shader pipeline**: a mesh shader replacing vertex+index buffers for
  your dual-contour output would eliminate the topology generation step from
  the binary shader path.
