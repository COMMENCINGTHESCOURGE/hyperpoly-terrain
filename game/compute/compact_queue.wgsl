// vinculum: compaction_density / queue_sparsity
//   Ratio of active work items vs total queue capacity after culling.
//   Drives dispatch sizing for downstream passes.
// layer: compute
// domain: terrain (maps to economy as transaction_volume / ledger_depth,
//          evacuation as crowd_density / exit_throughput)
//
@group(0) @binding(0) var<storage, read> raw_queue: array<u32>;
@group(0) @binding(1) var<storage, read> queue_count: atomic<u32>;
@group(0) @binding(2) var<storage, read_write> compacted_queue: array<u32>;
@group(0) @binding(3) var<storage, read_write> dispatch_args: DispatchArgs;

var<workgroup> block_sum: array<u32, 256>;
var<workgroup> block_offsets: array<u32, 256>;

@compute @workgroup_size(256)
fn compact_pass(@builtin(local_invocation_id) lid: vec3<u32>,
                @builtin(workgroup_id) wid: vec3<u32>) {
  let tid = lid.x;
  let total = atomicLoad(&queue_count);
  let block_start = wid.x * 256u;

  // Pass 1: Block-level exclusive scan
  let in_bounds = tid < total && (block_start + tid) < total;
  block_sum[tid] = select(0u, 1u, in_bounds);
  workgroupBarrier();

  var shift = 1u;
  loop {
    if (shift >= 256u) { break; }
    let val = select(0u, block_sum[tid - shift], tid >= shift);
    block_sum[tid] += val;
    workgroupBarrier();
    shift <<= 1u;
  }

  // Store block totals for global scan
  if (tid == 0u) {
    block_offsets[wid.x] = block_sum[255u];
  }
  workgroupBarrier();

  // Pass 2: Global prefix-sum of block offsets (single WG handles up to 16 blocks)
  if (wid.x == 0u && tid < 16u) {
    var g_shift = 1u;
    loop {
      if (g_shift >= 16u) { break; }
      let g_val = select(0u, block_offsets[tid - g_shift], tid >= g_shift);
      block_offsets[tid] += g_val;
      workgroupBarrier();
      g_shift <<= 1u;
    }
  }
  workgroupBarrier();

  // Pass 3: Write compacted indices with global offset
  if (in_bounds) {
    let global_offset = select(0u, block_offsets[wid.x - 1u], wid.x > 0u);
    compacted_queue[global_offset + block_sum[tid] - select(0u, 1u, in_bounds)] = raw_queue[block_start + tid];
  }

  // Update dispatch args — thread 0 of block 0
  if (wid.x == 0u && tid == 0u) {
    dispatch_args.count_x = total;
    dispatch_args.count_y = 1u;
    dispatch_args.count_z = 1u;
  }
}
