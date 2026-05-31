# RFC 12: Native Backend Evaluation (Filament vs. The Forge)

## 1. Objective
To select the primary native C++ rendering backend for `hyperpoly-terrain`, enabling the Continuity Engine to bypass WebGL2 and WebGPU browser limitations (specifically host-GPU memory bottlenecks and memory limits).

## 2. Candidates

### Option A: Google Filament
A real-time physically based rendering engine for Android, iOS, Windows, Linux, macOS, and WebGL2.
- **Pros:** 
  - Phenomenal documentation.
  - Industry-leading PBR (Physically Based Rendering) pipeline.
  - Native Android/Vulkan integration is seamless.
- **Cons:** 
  - Heavy material compilation pipeline (`matc`).
  - Less flexibility for raw compute-only graphs.

### Option B: The Forge
A cross-platform rendering framework (Vulkan, Metal, D3D12, D3D11).
- **Pros:** 
  - Extremely lightweight abstraction.
  - Full support for D3D12 and raw compute meshlets.
- **Cons:** 
  - Sparse documentation; requires reading source examples.
  - You must build your own PBR pipeline from scratch.

## 3. Implementation Decision

We are proceeding with **Option A (Google Filament)** for the initial native backend.

**Rationale:**
The goal of the Continuity Engine is to simulate thermodynamic flow (erosion, fluids). While The Forge provides better raw compute flexibility, Filament's existing PBR pipeline allows us to immediately visualize fluid viscosity and rock density using high-fidelity materials (SSR, volumetric fog). We can achieve the `<2ms` mesh extraction target using Filament's Vertex Shader fetching from Uniform Buffers without needing to construct an entire PBR engine from scratch.

## 4. Migration Path
1. Maintain the WebGPU `src/compute` pipeline as the primary web target.
2. Develop `native/filament/src/` to map the 6-channel tensors into Filament `BufferObject`s via zero-copy memory maps (where supported by Vulkan/Metal).
3. Benchmark host-GPU sync overhead. If it reaches 0ms, mark the native port as stable.
