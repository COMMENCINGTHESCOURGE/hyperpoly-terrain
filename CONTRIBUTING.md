# Contributing to Hyperpoly-Terrain

Thank you for engaging with the continuity-engine vision. This guide helps you onboard efficiently and contribute meaningfully.

---

## 🧭 Philosophy First

Before coding, internalize:
> *"This is a continuity engine, not a game engine."*

We prioritize:
- **Physical consistency** over visual trickery
- **Field-based computation** over discrete entity updates
- **Conservation enforcement** over performance-at-all-costs
- **Domain-agnostic design** over game-specific shortcuts

If your PR introduces heightmap-only logic, host-GPU sync, or non-conservative updates, it will be respectfully declined.

---

## 🚀 Onboarding Steps

### 1. Environment Setup
```bash
# Clone
git clone https://github.com/COMMENCINGTHESCOURGE/hyperpoly-terrain.git
cd hyperpoly-terrain

# Install deps (requires Node 18+, Rust for WGSL tooling)
npm install

# Verify WebGPU support
npm run doctor
```

### 2. Run the Demo
```bash
npm run demo:game
# Opens narrative-driven splash screen → boot pipeline → interactive demo
```

### 3. Run Tests + Benchmarks
```bash
npm test                    # Unit + integration tests
npm run benchmark:quick    # 10-iteration perf smoke test
```

### 4. Pick a Good First Issue
Look for labels:
- `good first issue` — Small, well-scoped tasks
- `help wanted` — Areas needing community input
- `vinculum` — Metadata scheduler work
- `native-backend` — Filament/The Forge exploration

---

## 📐 Coding Standards

### WGSL / Compute Shaders
- Use `@group(0) @binding(X)` explicitly
- Prefer `workgroup_size(64)` for erosion kernels
- Document conservation constraints in comments:
  ```wgsl
  // CONSERVATION: mass_outflow <= mass_inflow - absorption
  ```

### TypeScript / API Surface
- Strict mode enabled (`"strict": true` in tsconfig)
- No `any`; use typed tensors: `MaterialTensor<'rock' | 'soil'>`
- Async methods return `Promise<Result<T, EngineError>>`

### Testing
- New features require benchmark regression tests
- Conservation logic requires property-based tests (fast-check)
- Visual changes require screenshot diff in CI

---

## 🔄 PR Workflow

1. Fork + create branch: `feat/your-feature` or `fix/issue-123`
2. Implement + test locally
3. Run `npm run lint && npm test && npm run benchmark:quick`
4. Open PR with:
   - Clear description of continuity impact
   - Benchmark deltas (if perf-related)
   - Screenshot/video (if visual)
5. Respond to review; maintainers merge after 2 approvals

---

## 🧪 Experimental Features

Some areas are actively evolving:
- `native/` — Filament/The Forge backend (RFC #12)
- `vinculum/` — Metadata scheduler (alpha API)
- `examples/react-hook/` — React integration (community-maintained)

Label experimental code with `@experimental` JSDoc and guard behind feature flags.

---

## 🗣️ Communication

- Technical discussions: GitHub Issues / Discussions
- Quick questions: Discord (link in profile)
- Security reports: dashawn@guineapigtrench.com (PGP key on request)

---

## 🙏 Recognition

Contributors are credited in:
- `CHANGELOG.md`
- GitHub Releases
- The engine's boot sequence narrative (yes, really)

*"Continuity is a collective effort."*
