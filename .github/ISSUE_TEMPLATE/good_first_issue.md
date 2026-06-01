---
name: Good First Issue
about: A scoped task perfect for new contributors to the MANIFOLD ecosystem.
title: "[TASK] "
labels: "good first issue, help wanted"
assignees: ''
---

## 👋 Good First Issue: Add Uniform Binding Validation

### 🎯 Goal
Prevent silent shader failures by validating that all required uniform bindings are present before pipeline creation.

### 📍 Location
`native/filament/src/TerrainRenderer.cpp`

### ✅ Acceptance Criteria
- [ ] Check that `binding = 0` (material tensor) and `binding = 1` (QEF params) are present in `BindGroupLayout`
- [ ] Return a descriptive `Result<_, ShaderValidationError>` if missing
- [ ] Add unit test mocking a missing binding

### 💡 Starter Hints
- Use `wgpu::BindGroupLayoutEntry` iteration to inspect bindings
- See `validate_texture_binding()` in `utils.rs` for a similar pattern
- Error type can extend the existing `PipelineError` enum
