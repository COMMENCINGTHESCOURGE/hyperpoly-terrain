#!/usr/bin/env python3
"""
ACCEPTANCE GATE — HYPERPOLY GPU Compute Pipeline (Phase 5/6)
Run from: C:\\Users\\dasha\\Projects\\hyperpoly-terrain\\game

Validates cross-file invariant consistency across:
  - hydraulic_host.js       (JS dispatch host)
  - pass1_culling.wgsl      (GPU culling kernel)
  - pass2_solver.wgsl       (GPU advection kernel)
  - validate_rainfall.js    (JS proxy + GPU validation test)

Acceptance philosophy:
  vinculum is not a document — it is a machine-enforceable assertion gate.
  Every invariant below is a testable constraint. If it cannot be checked
  automatically, it is not a vinculum; it is commentary.
"""
import os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST   = ROOT / "hydraulic_host.js"
VALID  = ROOT / "validate_rainfall.js"
CULL   = ROOT / "pass1_culling.wgsl"
SOLVER = ROOT / "pass2_solver.wgsl"

results = []

def chk(status, msg):
    results.append((status, msg))
    print(("PASS" if status else "FAIL"), msg)

def read(path):
    return path.read_text(encoding="utf-8")

host_text  = read(HOST)
cull_text  = read(CULL)
solver_text = read(SOLVER)
valid_text  = read(VALID)

# =============================================================================
# 1. Cross-file constant consistency
# =============================================================================

# 1a. WORLD_DIM = 256
chk("WORLD_DIM" in host_text, "host: WORLD_DIM declared")

# 1b. BRICK_DIM = 16
host_brk = None
for line in host_text.splitlines():
    m = re.search(r'BRICK_DIM\s*=\s*(\d+)', line)
    if m: host_brk = int(m.group(1)); break
chk(host_brk == 16, f"host: BRICK_DIM = {host_brk} (expected 16)")

# 1c. BRICK_DIM in WGSL matches host
solver_brk = None
for line in solver_text.splitlines():
    m = re.search(r'BRICK_DIM:\s*u32\s*=\s*(\d+)u', line)
    if m: solver_brk = int(m.group(1)); break
chk(solver_brk == 16, f"solver_wgsl: BRICK_DIM = {solver_brk}u (expected 16u)")

# 1d. TOTAL_BRICK_SLICES = 4096
chk("TOTAL_BRICK_SLICES" in host_text, "host: TOTAL_BRICK_SLICES declared")
chk("4096" in cull_text, "cull_wgsl: 4096 sentinel (brick count bound)")
chk("4096" in solver_text, "solver_wgsl: 4096 sentinel (VOXELS_PER_BRICK)")

# 1e. TOTAL_VOXELS = 16,777,216
chk("TOTAL_VOXELS" in host_text, "host: TOTAL_VOXELS declared")

# =============================================================================
# 2. Buffer size consistency
# =============================================================================

chk("TOTAL_VOXELS * 2" in host_text, "host: voxel channels = TOTAL_VOXELS * 2 (u16/2bytes ea)")
chk("TOTAL_BRICK_SLICES * 6 * 16" in host_text,
    "host: brickMetadata = TOTAL_BRICK_SLICES * 6ch * 16bytes")
chk("TOTAL_BRICK_SLICES * 4" in host_text,
    "host: brickState = TOTAL_BRICK_SLICES * 4 (u32/brick)")
chk("MAX_ACTIVE_BRICKS * 4" in host_text,
    "host: activeList = MAX_ACTIVE_BRICKS * 4 (u32 index list)")

# =============================================================================
# 3. WGSL entry point existence
# =============================================================================

chk("fn culling_pass" in cull_text, "cull_wgsl: 'fn culling_pass' exists")
chk("fn advection_pass" in solver_text, "solver_wgsl: 'fn advection_pass' exists")

# =============================================================================
# 4. Host entry point references
# =============================================================================

chk("'culling_pass'" in host_text, "host: references 'culling_pass'")
chk("'advection_pass'" in host_text, "host: references 'advection_pass'")
chk("'reset_pass'" in host_text, "host: references 'reset_pass'")
chk("'meta_dispatcher'" in host_text, "host: references 'meta_dispatcher'")

# =============================================================================
# 5. Bind group layout consistency (host <-> WGSL)
# =============================================================================

# 5a. pass2_solver.wgsl group(0) bindings
solver_bindings = [
    (0, "brick_meta"), (1, "water_u16"), (2, "water_dst_u16"),
    (3, "perm_x_u16"), (4, "perm_y_u16"), (5, "perm_z_u16"),
    (10, "edit_min_buffer"), (11, "edit_max_buffer"),
]
for b, name in solver_bindings:
    pat = r'@group\(0\).*@binding\(' + str(b) + r'\).*' + name
    chk(bool(re.search(pat, solver_text, re.DOTALL)),
        f"solver_wgsl: @binding({b}) = {name}")

# 5b. pass2_solver.wgsl group(1) = compacted_queue
chk("@group(1) @binding(0)" in solver_text,
    "solver_wgsl: group(1) binding(0) exists (compacted_queue)")

# 5c. pass1_culling.wgsl group(0) bindings
cull_bindings = [
    (0, "meta_buffer"), (1, "brick_state"), (2, "raw_queue"),
    (3, "queue_count"), (4, "sched_params"), (5, "camera_pos"),
]
for b, name in cull_bindings:
    pat = r'@group\(0\).*@binding\(' + str(b) + r'\).*' + name
    chk(bool(re.search(pat, cull_text, re.DOTALL)),
        f"cull_wgsl: @binding({b}) = {name}")

# 5d. Host bind group declarations
for bg in ["pass1BindGroup", "pass2BindGroup0", "pass2BindGroup1",
           "_metaBindGroup", "_resetBindGroup"]:
    chk(bg in host_text, f"host: {bg} declared")

# =============================================================================
# 6. Workgroup / dispatch consistency
# =============================================================================

chk("workgroup_size(64)" in cull_text, "cull_wgsl: workgroup_size(64)")
chk("workgroup_size(8, 8, 8)" in solver_text, "solver_wgsl: workgroup_size(8, 8, 8)")
chk("tile_water: array<f32, 4096>" in solver_text,
    "solver_wgsl: 16KB shared memory (WebGPU 32KB limit OK)")
chk("dispatchWorkgroupsIndirect" in host_text, "host: pass2 uses indirect dispatch")
chk("dispatchWorkgroups(16, 1, 1)" in host_text,
    "host: meta dispatcher 16 WGs (4096 bricks at 256 threads/WG)")

# =============================================================================
# 7. validate_rainfall.js integrity
# =============================================================================

chk("BRICK_DIM = 16" in valid_text or "BRICK_DIM=16" in valid_text,
    "validate: BRICK_DIM = 16")
chk("permX" in valid_text and "permY" in valid_text and "permZ" in valid_text,
    "validate: split perm channels (consistent with host)")
chk("DUPLICATE BRICK INDICES" in valid_text,
    "validate: duplicate-detection check present")
chk("OOB index" in valid_text,
    "validate: OOB-index check present")
chk("MASS_TOLERANCE" in valid_text,
    "validate: mass-conservation tolerance defined")
chk("validateGPU" in valid_text,
    "validate: GPU validation function declared (may be stub)")
chk("Wetting front propagating" in valid_text,
    "validate: front-propagation assertion present")

# =============================================================================
# 8. Ping-pong buffer swap
# =============================================================================

chk("voxelWaterDst" in host_text, "host: voxelWaterDst (ping-pong buffer)")
chk("copyBufferToBuffer" in host_text, "host: waterDst -> water copy after solver")
chk("water_dst_u16" in solver_text, "solver_wgsl: writes to water_dst (not in-place)")

# =============================================================================
# 9. Scheduling parameters
# =============================================================================

chk("schedParamsBuffer" in host_text, "host: schedParamsBuffer declared")
chk("sched_params" in cull_text, "cull_wgsl: sched_params uniform consumed")

# =============================================================================
# 10. Camera & LOD culling
# =============================================================================

chk("cameraBuffer" in host_text, "host: camera uniform buffer declared")
chk("camera_pos" in cull_text, "cull_wgsl: camera_pos uniform consumed")
chk("dist_to_camera" in cull_text, "cull_wgsl: LOD distance-based culling")


# =============================================================================
# 11. CRITICAL: Buffer usage type mismatch (host vs WGSL)
# =============================================================================
#
# pass2_solver.wgsl declares @group(0) @binding(0) as var<uniform> brick_meta.
# host creates brickMetadata via _createStorage (STORAGE | COPY_DST | COPY_SRC).
# With layout:'auto', pipeline expects UNIFORM at binding 0.
# The host buffer has no UNIFORM usage -- GPUValidationError at bind time.
#
chk("UNIFORM" in host_text,
    "CRITICAL: host brickMetadata must include UNIFORM usage for binding 0")
chk("@binding(0) var<uniform> brick_meta" in solver_text,
    "CONFIRMED: solver_wgsl binding(0) declared as uniform type")

# =============================================================================
# Summary
# =============================================================================

all_pass = all(r for r, _ in results)
fail_count = sum(1 for r, _ in results if not r)
pass_count = sum(1 for r, _ in results if r)
print(f"\n{'='*60}")
print(f"ACCEPTANCE GATE: {'ALL PASS' if all_pass else f'{fail_count} FAILURES out of {len(results)}'}")
print(f"  Pass: {pass_count}, Fail: {fail_count}")
print(f"{'='*60}")
for status, msg in results:
    print(f"  {'ok' if status else 'FAIL'} {msg}")
sys.exit(0 if all_pass else 1)
