// vinculum: reset_frequency / epoch_duration
//   How often the work queue fully drains between simulation ticks.
//   Higher = more churn per cycle.
// layer: compute
// domain: terrain (maps to economy as settlement_cycle / collapse_window,
//          NPC as daily_routine / activity_reset)
//
@group(0) @binding(0) var<storage, read_write> queue_count: atomic<u32>;

@compute @workgroup_size(1)
fn reset_pass() {
  atomicStore(&queue_count, 0u);
}
