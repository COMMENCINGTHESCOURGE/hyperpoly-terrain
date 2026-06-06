# Integration Analysis: Chaotic Terrain Demo vs hyperpoly Pipeline

A side-by-side of a shippable 280-line demo and your 1600+ line compute pipeline.
The thesis: this demo has everything your pipeline needs for a game layer except
the terrain itself. Your pipeline has everything this demo needs for terrain
except the rendering.

---

## What This Demo Has That You Need

| Feature | Demo (280 lines) | hyperpoly | What it would take |
|---------|------------------|-----------|-------------------|
| **First-person camera** | WASD + mouse look + pointer lock, world wrapping, ground-hug + underwater detection | None — orbit camera only | Port the 40-line camera controller to bridge.html. The pointer lock + WASD + friction-based movement is a direct replace for the orbit controls |
| **Instanced vegetation** | 3 grass blade types × 833 instances each, 3 tree variants × 83 instances each, with per-instance sway animation data (phase, speed, amount) | None — no vegetation system | Your terrain extraction produces vertex buffers. Grass instances could be seeded from the material tensor's surface cohesion map (grass grows where cohesion > 0.3 and water < 0.1) |
| **Weather system** | 700 rain particles, lightning with fog flash + ambient intensity spike, underwater overlay opacity | None | The rain is a PointsMaterial — 20 lines. Lightning is a timer + color swap. Underwater is a CSS overlay. These are trivial to add once the camera knows its height relative to water level |
| **Water plane** | Animated wave vertices on a PlaneGeometry, transparent, depthWrite:false | None yet — the simulation has a water channel (channel 5) but no rendered water surface | The water channel in your tensor could drive the water plane height with more fidelity than sin(t + x*0.3) |
| **Seamless world wrap** | `camera.position.x = ((camera.position.x % WORLD) + WORLD) % WORLD` | 256³ fixed grid, no wrapping | Your 256³ grid can't wrap without toroidal topology. But your bricks already have per-brick metadata — wrapping means the index math wraps at brick boundaries |
| **Atmosphere** | FogExp2 with lightning flash color change, sky color matched to fog | None | Scene.background + FogExp2 is 2 lines. Lightning color swap is 6 lines |
| **Audio cues (implicit)** | None here, but the rain/lightning/thunder is screaming for it | construction_audio.js exists but isn't wired to weather | Your procedural audio system (Web Audio API, no downloads) could generate rain ambient noise and thunder claps keyed to the lightning timer |

---

## What Your Pipeline Has That This Demo Needs

| Feature | hyperpoly | Demo (280 lines) | What it would enable |
|---------|-----------|------------------|---------------------|
| **6-channel material tensor** | density, cohesion, perm_x/y/z, water | Flat heightmap: `sin(x*0.1)*cos(z*0.1)*2.5 + sin(x*0.4)*0.3` | Vegetation placement driven by cohesion + moisture. Erosion over time. Terrain that responds to rain |
| **GPU hydraulic simulation** | Darcy flux, conservation pass | Static terrain — rain is visual only, no erosion | Rain particles actually erode the terrain. Lightning strikes leave craters |
| **Material-aware mesh** | Cohesion-weighted QEF dual contouring | Grid-based heightmap with vertex colors | Terrain geometry changes when you dig. Material boundaries (rock/soil/sand) are visible edges, not color gradients |
| **Indirect draw pipeline** | GPU-sized dispatch for culled bricks | Single draw call for full grid | Infinite world scaling — only visible chunks render |
| **Material calibration** | PBR texture stats mapped to tensor channels | Hardcoded green/brown vertex colors | Realistic terrain colors from scanned materials |

---

## The Merge Point

The gap between these two codebases is approximately **one file** — a new bridge
that replaces the demo's `getHeight()` function with your tensor extraction output.

Current demo flow:
```
getHeight(x,z) → sin/cos noise → terrain mesh → render (Three.js)
```

Merged flow:
```
hyperpoly tensor simulation → QEF extraction → vertex buffer → 
TerrainRenderer (WebGPU) renders the mesh → 
player walks on simulation output, not noise
```

The demo's camera, vegetation, weather, water, lightning — all of that stays as-is.
Only the terrain sourcing changes. The demo's `getHeight()` becomes a read from
your extracted vertex buffer's Y values at the player's XZ position.

**Estimated lines of glue code: ~80** — a terrain query function that samples
the dual-contour vertex buffer instead of computing sin/cos, plus the camera
controller swap from orbit to WASD in bridge.html.

---

## Implementation sketch for the merge

```
In bridge.html:

1. Replace orbit camera with WASD + pointer lock (port from demo, ~50 lines)
2. Add terrain height query: sample vertex buffer Y at player XZ
   (barycentric interpolation across the dual-contour mesh triangle, ~25 lines)
3. Optional: seed instanced grass/trees at startup from cohesion buffer
   (read cohesion per brick, place instances in high-cohesion regions, ~30 lines)
4. Optional: rain + lightning + water plane (port from demo, ~80 lines)

Total glue: ~185 lines
New feature: player walks on simulation output, not noise
```

The demo is proof that the game layer is cheap. 280 lines buys you first-person
movement, instanced vegetation, weather, lightning, underwater, seamless world.
Your pipeline has the terrain fidelity that 280 lines can't buy. The merge is
the right direction.
