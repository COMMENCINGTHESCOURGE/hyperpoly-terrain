# Architecture Comparison: hyperpoly-terrain vs jo56/procedural-terrain

> A structural comparison of two WebGPU terrain systems: your material-first
> hyperpoly pipeline (v11 hybrid compute) and jo56's Rust→WASM chunked generator.

Last updated: 2026-05-28

---

## 1. High-Level Philosophy

### jo56/procedural-terrain

Heightmap-as-image. The terrain is a single scalar field (elevation) computed on
GPU, rendered with vertex coloring. Generation is the whole story — there is no
simulation layer, no material system, no erosion.

- **Data model**: Single f32 height per vertex
- **Goal**: Real-time flyover of generated terrain
- **Lifetime**: Static after generation (regenerate on R key, then static again)

### hyperpoly-terrain

Material-as-volume. The terrain is a 6-channel material tensor in a 256³ voxel
grid, quantized to u16 per channel via per-brick metadata. Height is just
channel 0 (density). The system runs a hydraulic simulation on top, and the
visible mesh is extracted from the material field via Hermite data → QEF → dual
contouring.

- **Data model**: 6-channel SoA u16 voxel field (density, cohesion, perm_x,
  perm_y, perm_z, water)
- **Goal**: Persistent simulation with erosion, editing, and material-aware mesh
- **Lifetime**: Perpetually mutating — sim ticks at 20Hz, mesh re-extracts on
  change

---

## 2. Pipeline Architecture

### jo56 — Minimal GPU Pipeline

```
CPU ──→ Frustum culling (33×33 chunk grid)
         │
         ├── Compute pass: height generation (one per missing chunk)
         │     ↓
         └── Render pass: indexed draw per visible chunk
               ↓
         Frame output
```

- **2 pipeline types**: compute (height gen) + render
- **No simulation pipeline**: no culling pass, no solver pass, no conservation
- **No mesh extraction**: vertices are the grid vertices, not a surface fit

### hyperpoly — Multi-Stage GPU Pipeline

```
CPU ──→ uploadQuantizedTerrain()  (one-time or on edit)
         │
    ┌────┴─────────────────────────────────┐
    │  SIM LOOP (20Hz)                     │
    │                                      │
    │  Pass 1: Culling — which bricks      │
    │  are active (moisture/stability)     │
    │        ↓ atomic append queue         │
    │  Pass 1b: Compact queue              │
    │        ↓ indirect dispatch           │
    │  Pass 2: Advection (Darcy flux)      │
    │  per active 16³ brick                │
    │        ↓                             │
    │  Conservation pass (closed-system    │
    │  mass correction per brick)          │
    │                                      │
    │  Edit pass (if pending): brush       │
    │  writes direct to voxel channels     │
    └────────┬─────────────────────────────┘
             │
    ┌────────┴─────────────────────────────┐
    │  MESH EXTRACTION (on dirty)          │
    │                                      │
    │  Phase 5 (fullExtract):              │
    │  ├─ Hermite pass: sample 6-channel   │
    │  │  gradients → HermiteData (pos,    │
    │  │  normal, feature_weight)          │
    │  ├─ QEF solve: gradient descent →    │
    │  │  dual vertex positions            │
    │  ├─ LOD computation: per-cell        │
    │  │  flags for simplification         │
    │  └─ Delta: compare prev→curr         │
    │     vertices for streaming           │
    │                                      │
    │  Phase 5Draw:                        │
    │  ├─ Topology gen: marching quads     │
    │  ├─ LOD stitching: seal adjacent     │
    │  │  LOD boundaries                   │
    │  └─ indirect draw args               │
    └────────┬─────────────────────────────┘
             ↓
       WebGL2 render pass (Three.js)
```

---

## 3. Chunking / Data Model Comparison

| Aspect | jo56 | hyperpoly |
|--------|------|-----------|
| Grid | 33×33 chunks, 64² verts each | 16×16×16 bricks, 256³ world |
| Total primitives | ~1089 chunks × 4096 verts = ~4.5M verts | 4096 bricks × 4096 voxels = 16.7M voxels |
| Per-element data | 1 f32 height | 6 u16 channels + fp16 metadata |
| Quantization | None (f32) | Per-brick min/scale → u16 (2:1 compression) |
| Memory per frame | ~18MB vertex data | ~96MB voxel data + ~475MB Hermite staging + ~199MB vertex buffer |
| GPU-CPU sync | **Per frame**: frustum cull on CPU, LRU management on CPU | **Zero in sim loop**: all dispatch is indirect, all scheduling is GPU-side |
| LOD | None (all chunks equal) | Per-cell LOD flags (computed on GPU), stitch pass for boundaries |

---

## 4. Zero Host-GPU Sync: The Real Difference

**jo56** has CPU in the hot path every frame:

```rust
// terrain.rs — update() runs every frame on CPU
fn update(&mut self, camera_pos: ...) {
    self.frame_counter += 1;
    let cx = ...; // CPU computes camera chunk position
    for coord in needed_chunks {
        if !self.slots.iter().any(|s| s.coord == coord) {
            // CPU decides which chunk to recycle (LRU)
            let slot = self.get_free_slot();
            self.generate_chunk(slot, coord); // CPU dispatches compute
        }
    }
    // CPU frustum culling
    for slot in visible_slots {
        // CPU writes camera uniforms, chunks uniforms
        render_pass.set_bind_group(...)
        render_pass.draw(...)
    }
}
```

**hyperpoly** breaks this entirely:

```js
// hydraulic_host.js — step() has zero CPU readback
step() {
    queue.writeBuffer(indirectBuffer, 0, this._dispatchInit);  // 4 bytes
    queue.writeBuffer(budgetCounter, 0, new Uint32Array([0])); // 4 bytes

    // Pass 1: GPU decides which bricks to simulate
    pass.dispatchWorkgroups(workgroups);  // atomic append → indirect buffer
    // Pass 2: GPU reads indirect buffer and dispatches exactly N bricks
    pass.dispatchWorkgroupsIndirect(indirectBuffer);
    // Submit — CPU done until next frame
}
```

The only CPU write per frame: 8 bytes (indirect init + budget reset). No CPU
reads back dispatch count during the sim loop. The extraction pipeline does
readback delta counts, but that's visual-only — the simulation doesn't wait on
it.

---

## 5. Mesh Extraction: Heightmap vs Material-Aware Surface

### jo56
Vertices = grid vertices. Height = f32 buffer written by compute shader.
Render uses a static index buffer + per-vertex UV → vertex shader samples
height. No mesh generation, no surface fitting.

### hyperpoly
Uses **Dual Contouring** with material-aware weights:

```
Input: 6-channel voxel field
  ↓
Hermite pass: samples density + cohesion gradients at each grid vertex
  → HermiteData { pos, normal, weight }
  → feature_weight = clamp(mag(grad(cohesion)) * 10, 0, 1)
  → Sharp material interfaces get weight≈1 (preserved edges)
  → Smooth density gradients get weight≈0 (rounded surfaces)
  ↓
QEF solve: fits dual vertex position to minimize Σ(weight · (n·(x-p))² )
  → 10 iterations gradient descent per cell
  → Feature preservation: blend toward sharpest corner when max_weight > 0.3
  ↓
Topology: marching quads over dual grid
  ↓
LOD: per-cell simplification flags based on curvature + material complexity
```

This means: material boundaries (cohesion changes) become **mesh edges**, not
just texture seams. A sandstone-limestone interface generates a vertex on that
boundary. jo56 treats all terrain as a single material with height variation.

---

## 6. Simulation: What jo56 Doesn't Have

hyperpoly runs a hydraulic simulation that jo56 has no analogue for:

| Pass | What it does | WGSL line count | Unusual aspect |
|------|-------------|-----------------|----------------|
| Culling | EMA-smooths moisture, applies hysteresis deadband, atomic-append active bricks to queue | 52 lines | Stateful: brick_state persists between frames (moisture EMA) |
| Advection | Darcy flux: reads 6-connected neighbors from shared memory (16KB tile), computes central-difference gradient, applies permeability-weighted flux divergence | 203 lines | Single-channel tiling: only water lives in shared memory; permeability streamed from global (L1/L2) |
| Conservation | Reduces brick to compute drift, distributes correction evenly | 51 lines | vinuculum: mass_exchange/volume_correction — closed-system invariant enforcement |

The advection shader's architecture is notable: 8×8×8 workgroups loading a 16³
tile into shared memory (16KB of f32 — fits under the 32KB WebGPU limit).
Neighbors use simple boundary clamping (no halo exchange). The permeability
vector is read from global memory per-thread — the insight being that perm is
read-only and L1/L2 cached, so the 16KB budget goes entirely to the water
field.

---

## 7. Project Structure Comparison

```
jo56/procedural-terrain        hyperpoly-terrain
======================         =================
src/                           game/
  lib.rs       (WASM entry)      compute/
  webgpu.rs    (init)               hyperpoly_geology.js   (brick management)
  terrain.rs   (chunks + render)    geology_quantizer.js   (fp16 pack/unpack)
  camera.rs    (fly cam)            hydraulic_host.js      (culling + solver dispatch)
  sky.rs       (stars/suns)         conservation_pass.wgsl
  particles.rs (WIP weather)        pass1_culling.wgsl
  presets.rs                       pass2_solver.wgsl
  input.rs                          compact_queue.wgsl
  utils.rs                         reset_queue.wgsl
shaders/                           collision/
  terrain.wgsl                        collision_sphere.wgsl
  sky.wgsl                            collision_query.wgsl
  particles.wgsl                     CollisionSystem.js
web/                                 FirstPersonController.js
  index.html                        phase5_extractor/
  main.ts                              phase5_host.js     (orchestrator)
  style.css                            phase5_draw.js     (indirect draw)
  constants.ts                         phase5_hermite.wgsl
  types.ts                             phase5_qef.wgsl
  utils.ts                             phase5_topology.wgsl
                                      phase5_lod.wgsl
                                      phase5_delta.wgsl
                                      phase5_stitch.wgsl
                                    phase6_edit/
                                      phase6_host.js
                                      phase6_edit.wgsl
                                    playable_world.js    (main loop)
                                    minimal_input.js
                                    minimal_ui.js
                                    minimal_audio.js
                                  extension/
                                  bridge/
```

Key structural differences:

1. **Language**: jo56 uses Rust→WASM (compiled), hyperpoly uses native JS +
   WGSL (no build step, matches trench-builder philosophy)
2. **Shader organization**: jo56 bundles shaders by domain (terrain.wgsl, sky.wgsl);
   hyperpoly separates by pipeline phase (hermite.qef.lod.delta as distinct
   entry points)
3. **Host vs shader split**: jo56 keeps host logic in Rust (terrain.rs = 500+
   lines). hyperpoly distributes host logic across many small JS files, one per
   pipeline phase
4. **Collision**: hyperpoly has a dedicated collision system (sphere queries,
   BVH). jo56 has none (fly-through camera, no collision)

---

## 8. What Each Does Better

### jo56 strengths
- **Ship-ready**: single `npm run dev` and it works. Has a live demo URL.
- **Sky system**: 8000 stars, 200 celestial bodies, configurable suns/moons
- **Weather WIP**: GPU particle system for rain/snow
- **Settings panel**: real-time slider manipulation with non-linear mapping for
  fine control near zero
- **Frustum culling**: conservative AABB test against 6 frustum planes —
  hyperpoly has no view-dependent culling yet (the 256³ grid is always fully
  simulated)
- **Chunk LRU**: well-tested recycling with frame counter eviction
- **Simplex domain warping**: multiple pattern presets with real-time switching

### hyperpoly strengths
- **Material tensor simulation**: 6-channel voxel field enables physics far
  beyond heightmaps — water advection, erosion, material-aware mesh extraction
- **Zero host-GPU sync in sim loop**: jo56's CPU frustum cull + LRU management
  is per-frame CPU work that doesn't scale. hyperpoly's culling is GPU-side
  with indirect dispatch
- **Closed-system conservation**: the conservation_pass enforces mass
  invariants across erosion cycles — jo56 has no simulation at all
- **Material-aware mesh**: dual contouring with cohesion-weighted QEF produces
  sharp edges at material boundaries, not just height-based geometry
- **Delta streaming**: compares prev/curr vertex buffers on GPU, writes only
  changed vertices — enables incremental render updates without full rebuild
- **Editing**: phase6 edit system writes brush strokes directly to voxel
  channels on GPU (terrain sculpting, material painting)
- **vinculum annotations**: every WGSL file has a vinculum metric header that
  maps the compute parameter to cross-domain analogues (economy, AI,
  evacuation)

---

## 9. Gaps Each Could Learn From

### hyperpoly could borrow from jo56
- **View-dependent culling**: the 256³ grid is currently always-on. jo56's
  frustum-culled chunk grid at 33×33 is a proven pattern — adapt it to brick
  culling
- **Sky/atmosphere system**: jo56's star field, celestial bodies, configurable
  suns/moons is a complete system. hyperpoly has no sky
- **Settings panel UX**: jo56's non-linear sliders + presets system is polished.
  hyperpoly has minimal UI (MinimalUI.js is 50 lines)
- **Live demo**: jo56 has a deployed URL. hyperpoly could benefit from a GH
  Pages build
- **Single-file deployment**: jo56's WASM build produces a clean bundle.
  hyperpoly's multi-file JS imports need a bundler step for deployment

### jo56 could borrow from hyperpoly
- **Material layering**: jo56's vertex coloring is cosmetic. Adding even 2-3
  material channels would enable realistic erosion coloring (exposed rock vs
  soil vs grass)
- **GPU scheduling**: jo56's CPU-side chunk LRU could be replaced with GPU
  atomic queues + indirect dispatch. Not essential for the current design, but
  limits scaling to larger worlds
- **Conservation**: jo56 has no invariants. If it added hydraulic erosion, mass
  would drift
- **Incremental mesh**: jo56 regenerates all chunks on any parameter change. A
  delta system would help with real-time editing

---

## 10. When to Reference Each

**Reference jo56 when you need**:
- A working reference for Rust→WASM→WebGPU chunk streaming
- Frustum culling implementation with p-vertex AABB
- Terrain preset system design (serializable settings, non-linear sliders)
- Sky/atmosphere system for a future hyperpoly sky pass
- A minimum-viable WebGPU terrain that ships

**Reference hyperpoly when you need**:
- Multi-channel voxel simulation on WebGPU with zero CPU sync
- Dual contouring with material-aware weights (cohesion-weighted QEF)
- GPU-side scheduling with atomic queues + indirect dispatch
- Closed-system conservation invariants for erosion simulation
- Delta-based mesh streaming for real-time terrain editing

---

## Appendix: VRAM Budget Comparison

| Component | jo56 (estimated) | hyperpoly (measured) |
|-----------|-----------------|---------------------|
| Height buffer | 4.5M × 4B = 18MB | — |
| Channel buffers | — | 6 × 4096 × 4096 × 2B = 201MB |
| Brick metadata | — | 4096 × 6 × 16B = 393KB |
| Hermite staging | — | 257³ × 28B = 475MB |
| Vertex buffer | — | 255³ × 12B = 199MB |
| Index buffer | 4.5M × 4B = 18MB | 255³ × 6 × 4B = 398MB |
| LOD buffer | — | 255³ × 4B = 66MB |
| Dispatch/budget | ~1KB | ~1KB |
| **Total VRAM** | **~40MB** | **~1.34GB** |

hyperpoly trades VRAM for fidelity and simulation capability. The Hermite
staging buffer (475MB) is the biggest target for optimization — it's allocated
for worst-case 257³ vertices but could be tiled to reuse across brick groups.
