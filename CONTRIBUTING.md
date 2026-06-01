# Contributing to hyperpoly-terrain

> *"Confusion is valuable feedback."*

Thank you for considering a contribution. This project is experimental by design — we prioritize physical accuracy and GPU-native continuity over polish. That means some edges are sharp, and that's intentional. Your perspective helps us refine where sharpness serves the vision, and where it just blocks entry.

## 🧭 Philosophy First

Before diving into code, please read the [MANIFOLD Manifesto](README.md#-the-manifold-manifesto) in the main README. Contributions should align with:
- **Field computation**: Simulate continuous phenomena, not discrete objects
- **Zero host-GPU sync**: Keep simulation state on the GPU; CPU only submits parameters
- **Material-first design**: Terrain is a tensor field, not a heightmap + overlays

If your idea challenges one of these, open a discussion first — we love principled dissent.

## 🚦 Getting Started

### Prerequisites
- Node.js 18+
- A WebGPU-capable browser (for testing)
- Optional: Python 3.10+ (for validator scripts)

### Setup
```bash
git clone https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain.git
cd hyperpoly-terrain
npm install
npm run dev  # Starts local server with hot reload
```

### Verify
Open `http://localhost:8080/game/index.html`. You should see a terrain that responds to rain toggles.

## 🎯 Good First Issues

We tag beginner-friendly tasks with [`good first issue`](https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). Current priorities:

### 🔤 Documentation & Clarity
- [ ] **Add WGSL comments** — Walk through `src/shaders/erosion/kernel.wgsl` line-by-line. Explain physical meaning, not just syntax.
- [ ] **Document the tensor schema** — Create `docs/tensor-spec.md` describing the 6 material channels, units, and valid ranges.
- [ ] **Write a "Why no CPU sync?" explainer** — 200 words max, for readers new to GPU compute.

### 🧪 Testing & Validation
- [ ] **Python validator tests** — Write tests in `tests/validators/` that ensure tensor outputs stay within physical bounds (e.g., moisture ∈ [0,1]).
- [ ] **WGSL linting** — Add `npm run lint:wgs` using `wgsl_analyzer` or similar.

### 🎨 Visual Onboarding
- [ ] **Capture erosion GIF** — Record 10s of hydraulic erosion; export as `docs/assets/erosion-before-after.gif`.
- [ ] **Design architecture diagram** — Create SVG showing CPU vs. GPU memory flow with crossed-out sync arrow.

> 💡 Not seeing a task that fits your skills? Open an issue with "I can help with: [your skill]" — we'll co-create a ticket.

## 📐 Code Standards

### WGSL Shaders
- Comment every `@group(0) @binding(X)` with its physical meaning
- Prefer `let` over `var` for intermediate values
- Name variables for physics: `sediment_flux`, not `temp1`

### JavaScript/TypeScript
- Use ES modules; no global state
- All GPU resource creation wrapped in `try/catch` with descriptive errors
- UI controls must have accessible labels

### Python (Validators)
- Type hints required
- Tests use `pytest`; run via `npm test:python`
- Mock GPU outputs with NumPy arrays; no WebGPU dependency in CI

## 🔄 Pull Request Process

1. Fork and create a branch: `git checkout -b feat/your-idea`
2. Make your changes; add tests/docs as needed
3. Run `npm run lint && npm run test` locally
4. Open a PR with:
   - **Title**: `[WGSL] Add erosion kernel comments` or `[Docs] Tensor schema v1`
   - **Description**: What changed, why, and how to verify
   - **Screenshot/GIF** if visual or behavioral change
5. Tag `@COMMENCINGTHESCOURGE` for review

We aim to review within 72 hours. If it's been longer, ping politely — life happens.

## ❓ Stuck? Confused?

Perfect. That's data.

- Open an issue with: *"I tried [X] to accomplish [Y], but got [Z]."*
- Or start a [Discussion](https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain/discussions) for open-ended questions

No question is too basic. If the docs didn't help, that's our bug — not yours.

## 🌱 Roadmap (High-Level)

| Milestone | Goal | Target |
|-----------|------|--------|
| `v0.3` | Stable tensor schema + validator suite | Q3 2026 |
| `v0.4` | Visual onboarding assets complete | Q4 2026 |
| `v0.5` | First research paper case study (erosion validation) | Q1 2027 |
| `v1.0` | Plugin API for custom material channels | 2027 |

*Dates are aspirational. Continuity > deadlines.*

---

## 🙏 Thank You

You're helping build a continuity engine — not just another terrain generator. Every comment, test, and diagram makes field computation more accessible.

*Field computation. Not a game engine. A continuity engine.*
