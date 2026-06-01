/**
 * MATERIAL CALIBRATION — Loads PBR texture statistics from AmbientCG texture sets
 * and converts them to calibrated initial conditions for the material tensor.
 * 
 * Calibrated channels:
 *   displacement.mean  → density (terrain height variation)
 *   roughness.mean     → perm_y (inverse: rough = less pervious)
 *   ambientocclusion.mean → cohesion (cavity density = cohesive zones)
 * 
 * Loading:
 *   const cal = await MaterialCalibration.load('calibration/calibration.json');
 *   cal.applyToGenerator(shellModelGenerator, 'gravel');
 *   const channels = shellModelGenerator(bx, by, bz); // gets calibrated values
 */

export class MaterialCalibration {
  constructor(data) {
    this.data = data;
    this.activeProfile = null;
  }

  static async load(jsonPath) {
    const resp = await fetch(jsonPath);
    const data = await resp.json();
    return new MaterialCalibration(data);
  }

  getProfiles() {
    return Object.keys(this.data.tensor_ranges || {});
  }

  setProfile(name) {
    const ranges = this.data.tensor_ranges?.[name];
    if (!ranges) {
      console.warn(`Calibration profile "${name}" not found. Available: ${this.getProfiles().join(', ')}`);
      return false;
    }
    this.activeProfile = name;
    this._ranges = ranges;
    console.log(`Material calibration: ${name}
  density center:    ${(ranges.density?.calibrated_center ?? 0.5).toFixed(3)}
  perm_y center:     ${(ranges.perm_y?.calibrated_center ?? 0.5).toFixed(3)}
  cohesion center:   ${(ranges.cohesion?.calibrated_center ?? 0.5).toFixed(3)}`);
    return true;
  }

  /**
   * Wraps a shellModelGenerator(bx, by, bz) → Float32Array[6] to use calibrated ranges.
   * The original function provides spatial variation; calibration shifts the mean.
   */
  wrapGenerator(originalGenerator, profileName) {
    if (!this.setProfile(profileName)) {
      return originalGenerator;
    }
    const r = this._ranges;
    const densityCenter  = r.density?.calibrated_center ?? 0.5;
    const permYCenter    = r.perm_y?.calibrated_center ?? 0.5;
    const cohesionCenter = r.cohesion?.calibrated_center ?? 0.5;

    return (bx, by, bz) => {
      const raw = originalGenerator(bx, by, bz);
      if (!raw || raw.length < 6) return raw;

      // raw[0] = density, raw[1] = cohesion, raw[2..4] = perm xyz, raw[5] = water
      // Shift toward calibrated center while preserving spatial variance
      raw[0] = (raw[0] * 0.3) + (densityCenter * 0.7);   // density
      raw[1] = (raw[1] * 0.3) + (cohesionCenter * 0.7);   // cohesion
      raw[2] = raw[2] * 0.7 + permYCenter * 0.3;           // perm_x (roughness-like)
      raw[3] = raw[3] * 0.7 + permYCenter * 0.3;           // perm_y
      raw[4] = raw[4] * 0.7 + permYCenter * 0.3;           // perm_z
      // raw[5] = water (unchanged — starts at 0)
      return raw;
    };
  }
}
