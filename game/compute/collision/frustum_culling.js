/**
 * FRUSTUM CULLING REFERENCE — Extracted from jo56/procedural-terrain/src/terrain.rs
 * 
 * The p-vertex method: for each frustum plane, compute which corner of the
 * AABB is "most inside" and test that. If the most-inside corner is outside
 * any plane, the whole AABB is culled.
 * 
 * Ported from Rust to JavaScript for reference.
 */

/**
 * Compute 6 frustum planes from a projection * view matrix.
 * Returns array of { normal: vec3, d: float } planes in view space.
 */
function extractFrustumPlanes(projViewMatrix) {
  // m is column-major 4x4
  const m = projViewMatrix;
  const planes = [];

  // Left:   m3 + m0
  // Right:  m3 - m0
  // Bottom: m3 + m1
  // Top:    m3 - m1
  // Near:   m3 + m2
  // Far:    m3 - m2
  const combos = [
    [3, 0], [3, 0, -1],  // left (+), right (-)
    [3, 1], [3, 1, -1],  // bottom (+), top (-)
    [3, 2], [3, 2, -1],  // near (+), far (-)
  ];

  for (let i = 0; i < 6; i++) {
    const c = combos[i];
    const sign = c.length === 3 ? -1 : 1;
    const rowA = c[0], rowB = c[1];
    
    let normal = [
      m[rowB * 4 + 0] + sign * m[rowA * 4 + 0],
      m[rowB * 4 + 1] + sign * m[rowA * 4 + 1],
      m[rowB * 4 + 2] + sign * m[rowA * 4 + 2],
    ];
    let d = m[rowB * 4 + 3] + sign * m[rowA * 4 + 3];
    
    // Normalize
    const len = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
    if (len > 1e-8) {
      normal[0] /= len; normal[1] /= len; normal[2] /= len;
      d /= len;
    }
    
    planes.push({ normal, d });
  }
  return planes;
}

/**
 * P-vertex AABB test against frustum.
 * Returns true if the AABB is INSIDE or INTERSECTING the frustum.
 * Returns false if fully OUTSIDE (culled).
 * 
 * @param {vec3} center - AABB center
 * @param {vec3} halfExtents - half-size on each axis
 * @param {Array} frustumPlanes - 6 planes from extractFrustumPlanes
 */
function testAABB(center, halfExtents, frustumPlanes) {
  for (const plane of frustumPlanes) {
    const n = plane.normal;
    
    // P-vertex: the corner most along the plane normal
    // Compute the signed distance of the p-vertex
    const px = n[0] > 0 ? center[0] + halfExtents[0] : center[0] - halfExtents[0];
    const py = n[1] > 0 ? center[1] + halfExtents[1] : center[1] - halfExtents[1];
    const pz = n[2] > 0 ? center[2] + halfExtents[2] : center[2] - halfExtents[2];
    
    const dist = n[0] * px + n[1] * py + n[2] * pz + plane.d;
    
    if (dist < 0) {
      // The most-inside corner is outside this plane → fully culled
      return false;
    }
  }
  return true;
}

/**
 * Get camera frustum from Three.js camera.
 * Returns 6 planes in world space suitable for testAABB().
 */
function getCameraFrustum(camera) {
  const m = new Float32Array(16);
  // camera.projectionMatrix * camera.matrixWorldInverse
  // Three.js stores matrices in column-major
  const p = camera.projectionMatrix.elements;
  const v = camera.matrixWorldInverse.elements;
  
  // Multiply projection * view
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      m[col * 4 + row] = 
        p[row] * v[col * 4] +
        p[row + 4] * v[col * 4 + 1] +
        p[row + 8] * v[col * 4 + 2] +
        p[row + 12] * v[col * 4 + 3];
    }
  }
  
  return extractFrustumPlanes(m);
}

export { extractFrustumPlanes, testAABB, getCameraFrustum };
