// vinculum: t_junction_count / seam_length
//   Number of unresolved T-junctions at LOD boundaries vs total seam length.
//   Zero = watertight mesh across all LOD levels.
// layer: extraction
// domain: terrain (maps to housing as wall_continuity / structural_seam,
//          transport as route_connectivity / intersection_quality)
//
// ──────────────────────────────────────────────────────────────
// PHASE 5: LOD STITCHING (Boundary Vertex Snapping)
// ──────────────────────────────────────────────────────────────
// Reads: QEF vertices, LOD flags
// Writes: Stitched vertex buffer (in-place)
// Prevents T-junctions at coarse/fine LOD boundaries.

@group(0) @binding(0) var<storage, read_write> qef_vertices: array<vec3<f32>>;
@group(0) @binding(1) var<storage, read> lod_flags: array<u32>;

const CELLS: u32 = 255u;
const CELL_STRIDE: u32 = 65025u;

@compute @workgroup_size(8, 8, 8)
fn stitch_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  let cx = gid.x;
  let cy = gid.y;
  let cz = gid.z;

  // Skip border cells (no neighbor outside grid)
  if (cx == 0u || cy == 0u || cz == 0u ||
      cx >= CELLS - 1u || cy >= CELLS - 1u || cz >= CELLS - 1u) { return; }

  let idx = cx + cy * CELLS + cz * CELL_STRIDE;
  let lod = lod_flags[idx];

  // Only snap if this is a fine cell (lod == 2)
  if (lod < 2u) { return; }

  // Check all 6 neighbors. If neighbor is coarse (lod == 0),
  // snap boundary face toward coarse vertex position.

  // -X neighbor
  let lod_xm = lod_flags[idx - 1u];
  if (lod_xm == 0u) {
    let coarse_v = qef_vertices[idx - 1u];
    qef_vertices[idx] = mix(qef_vertices[idx], coarse_v, 0.5);
  }

  // +X neighbor
  let lod_xp = lod_flags[idx + 1u];
  if (lod_xp == 0u) {
    let coarse_v = qef_vertices[idx + 1u];
    qef_vertices[idx] = mix(qef_vertices[idx], coarse_v, 0.5);
  }

  // -Y neighbor
  let idx_ym = cx + (cy - 1u) * CELLS + cz * CELL_STRIDE;
  let lod_ym = lod_flags[idx_ym];
  if (lod_ym == 0u) {
    let coarse_v = qef_vertices[idx_ym];
    qef_vertices[idx] = mix(qef_vertices[idx], coarse_v, 0.5);
  }

  // +Y neighbor
  let idx_yp = cx + (cy + 1u) * CELLS + cz * CELL_STRIDE;
  let lod_yp = lod_flags[idx_yp];
  if (lod_yp == 0u) {
    let coarse_v = qef_vertices[idx_yp];
    qef_vertices[idx] = mix(qef_vertices[idx], coarse_v, 0.5);
  }

  // -Z neighbor
  let idx_zm = cx + cy * CELLS + (cz - 1u) * CELL_STRIDE;
  let lod_zm = lod_flags[idx_zm];
  if (lod_zm == 0u) {
    let coarse_v = qef_vertices[idx_zm];
    qef_vertices[idx] = mix(qef_vertices[idx], coarse_v, 0.5);
  }

  // +Z neighbor
  let idx_zp = cx + cy * CELLS + (cz + 1u) * CELL_STRIDE;
  let lod_zp = lod_flags[idx_zp];
  if (lod_zp == 0u) {
    let coarse_v = qef_vertices[idx_zp];
    qef_vertices[idx] = mix(qef_vertices[idx], coarse_v, 0.5);
  }
}
