@group(0) @binding(0) var<storage, read_write> queue_count: atomic<u32>;

@compute @workgroup_size(1)
fn reset_pass() {
  atomicStore(&queue_count, 0u);
}
