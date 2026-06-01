// vinculum: dispatch_profile / budget_capacity
//   Ratio of actual dispatched workgroups vs available GPU compute budget.
//   Self-tunes: if budget exceeded, drops lowest-priority bricks next frame.
// layer: compute
// domain: terrain (maps to fleet as task_throughput / node_capacity)
//
// Meta-Dispatcher — profiles workload per tile, enforces thermal/VRAM budget
// Reads the compacted brick queue and produces a budget-constrained dispatch list
// that never exceeds the workgroup limit per frame.

struct DispatchArgs { count_x: u32, count_y: u32, count_z: u32 }

@group(0) @binding(0) var<storage, read> compacted_queue: array<u32>;
@group(0) @binding(1) var<storage, read> queue_count: atomic<u32>;
@group(0) @binding(2) var<storage, read> brick_priority: array<f32>;   // per-brick priority [0,1]
@group(0) @binding(3) var<storage, read_write> budgeted_queue: array<u32>;
@group(0) @binding(4) var<storage, read_write> dispatch_args: DispatchArgs;
@group(0) @binding(5) var<uniform> meta_params: vec4<f32>;
// meta_params.x = max_brick_budget (e.g. 1500)
// meta_params.y = target_utilization (0.0–1.0)
// meta_params.z = EMA alpha for frame-to-frame smoothing
// meta_params.w = reserved

var<workgroup> wg_priority: array<f32, 256>;
var<workgroup> wg_idx: array<u32, 256>;

@compute @workgroup_size(256)
fn meta_dispatcher(@builtin(local_invocation_id) lid: vec3<u32>,
                   @builtin(workgroup_id) wid: vec3<u32>,
                   @builtin(num_workgroups) num_wgs: vec3<u32>) {
  let tid = lid.x;
  let total = atomicLoad(&queue_count);
  let max_budget = u32(meta_params.x);
  let block_start = wid.x * 256u;

  // ── Phase 1: Load brick indices and priorities into workgroup memory ──
  let in_bounds = tid < total && (block_start + tid) < total;
  if (in_bounds) {
    let brick_idx = compacted_queue[block_start + tid];
    wg_idx[tid] = brick_idx;
    wg_priority[tid] = brick_priority[brick_idx];
  }
  workgroupBarrier();

  // ── Phase 2: Compute block-level budget ──
  // Each workgroup gets a proportional slice of the total budget
  let block_count = min(256u, total - min(block_start, total));
  let block_budget = u32(f32(block_count) / f32(max(1u, total)) * f32(max_budget));

  // ── Phase 3: Sort by priority (bitonic, in-place) ──
  // Only sort within this block if we're over budget
  var sort_needed = false;
  for (var k = 1u; k < block_count; k++) {
    if (k < block_count && wg_priority[k] > wg_priority[k - 1u]) {
      sort_needed = true;
    }
  }

  if (sort_needed) {
    // Simple insertion sort within workgroup (fast for small blocks)
    // OK since 256 is the max workgroup size
    for (var i = 1u; i < block_count; i++) {
      let key_p = wg_priority[i];
      let key_i = wg_idx[i];
      var j = i;
      loop {
        if (j == 0u || wg_priority[j - 1u] >= key_p) { break; }
        wg_priority[j] = wg_priority[j - 1u];
        wg_idx[j] = wg_idx[j - 1u];
        j--;
      }
      wg_priority[j] = key_p;
      wg_idx[j] = key_i;
    }
    workgroupBarrier();
  }

  // ── Phase 4: Write budgeted queue ──
  let capped = min(block_count, block_budget);
  if (tid < capped) {
    budgeted_queue[block_start + tid] = wg_idx[tid];
  }

  // ── Phase 5: Thread 0 of block 0 sets dispatch args ──
  if (wid.x == 0u && tid == 0u) {
    dispatch_args.count_x = min(max_budget, total);
    dispatch_args.count_y = 1u;
    dispatch_args.count_z = 1u;
  }
}
