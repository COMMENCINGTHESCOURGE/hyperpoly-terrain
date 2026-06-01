# MANIFOLD Ecosystem: 10 Micro-Tasks

The architectural constraints (Vinculum Compiler, 6-Channel Tensor, Semantic Evolution) are fully mathematically specified. We are now entering the execution phase. 

The following 10 micro-tasks will bring the specifications online and bridge the gap to the native C++ compute layer.

### Epic 1: The Vinculum Runtime
1. **[CLI]** Integrate `js-yaml` into `hyperpoly-terrain/package.json` and build a `manifold-build` Node script to parse `vinculum.yml` at compile time.
2. **[Compiler]** Implement Ping-Pong Buffer switching logic inside `vinculum-compiler.ts` to automatically flip `state_A` and `state_B` when injecting the `semi_implicit_conservation.wgsl` pass.
3. **[Pipeline]** Hook the output of the Vinculum Compiler (`dispatchSequence.ts`) directly into the main Three.js WebGPU render loop, completely replacing manual pipeline definitions.

### Epic 2: The Gemini Oracle (Dynamic Shaders)
4. **[SDK]** Scaffold `adapters/oracle/oracle_client.ts` using the `@google/genai` SDK to interface with Gemini.
5. **[System Prompting]** Write the exact system prompt template that forces Gemini to only write `flux_producer` WGSL code that strictly obeys the bounds of the 6-channel tensor.
6. **[Regex Extractor]** Write the parsing logic to extract the dynamically generated WGSL shader and its required `reads:` / `writes:` array from Gemini's markdown output to feed back into Vinculum.

### Epic 3: Native Backend Probing (Filament C++)
7. **[Baseline C++]** Write `native/qef_solve_baseline.cpp` as a direct, hand-written translation of `qef_solve.wgsl` to benchmark Filament's `JobSystem` and `GFX` layers.
8. **[Toolchain]** Set up the `CMakeLists.txt` for `hyperpoly-terrain/native` to link against the Filament engine.
9. **[Zero-Sync Bridge]** Implement the initial CPU-to-GPU memory transfer script. This is the *only* time the host touches the GPU (uploading initial noise), after which the zero-sync invariant locks down the pipeline.

### Epic 4: Semantic Evolution Render
10. **[HUD Integration]** Downsample the `concepts.json` output from the Colab Tensor Forge into a highly compressed binary format, and load it into `sovereign-resonance-node` to visually render semantic emergence as floating geometry.
