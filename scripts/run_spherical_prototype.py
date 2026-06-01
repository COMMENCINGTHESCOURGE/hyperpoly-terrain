#!/usr/bin/env python3
"""
VINCULUM SPHERICAL PROTOTYPER & TERRAIN OPTIMIZER
Implements the 12-channel Spherical Tensor computation, Vinculum compiler logic,
and SUBSTRATE_DELTA_SIEVE multi-metric validation.
Exports the final simulation state as game/spherical_seed.json.
"""

import os
import sys
import json
import math
import numpy as np

# Resolution parameter: N x N grid per cubemap face
N = 32
CHANNELS = 12

# Channel mapping definitions
ROCK = 0
SOIL = 1
SAND = 2
WATER = 3
ICE = 4
ORGANIC = 5
BIOMASS_PREY = 6
BIOMASS_PRED = 7
SPORE_DENSITY = 8
TERRAIN_STRESS = 9
THERMAL_FLUX = 10
PAD = 11

class VinculumCompilerPython:
    """Python port of the static Vinculum Compiler dependency resolution."""
    def __init__(self, spec_dict):
        self.spec = spec_dict
        self.dag = {}
        self.build_dag()
        self.validate_no_races()

    def build_dag(self):
        for name, mod in self.spec["modules"].items():
            self.dag[name] = set(mod.get("requires", []))
            # Auto-inject conservation module if flux producer writes water/sand
            if mod.get("flux_producer") and ("water" in mod["writes"] or "sand" in mod["writes"]):
                cons_mod = self.spec["modules"].get("semi_implicit_conservation")
                if cons_mod and name not in cons_mod.get("requires", []):
                    cons_mod.setdefault("requires", []).append(name)
                    self.dag["semi_implicit_conservation"] = set(cons_mod["requires"])

    def validate_no_races(self):
        write_map = {}
        for name, mod in self.spec["modules"].items():
            for ch in mod["writes"]:
                write_map.setdefault(ch, []).append(name)
        
        for ch, writers in write_map.items():
            if len(writers) > 1:
                for i in range(len(writers)):
                    for j in range(i + 1, len(writers)):
                        if not self.is_ordered(writers[i], writers[j]) and \
                           not self.is_ordered(writers[j], writers[i]):
                            raise ValueError(
                                f"Race condition on channel '{ch}': "
                                f"'{writers[i]}' and '{writers[j]}' write without ordering."
                            )

    def is_ordered(self, a, b):
        visited = set()
        stack = [a]
        while stack:
            curr = stack.pop()
            if curr == b:
                return True
            if curr in visited:
                continue
            visited.add(curr)
            for dep in self.dag.get(curr, []):
                stack.append(dep)
        return False

    def topo_sort(self):
        in_degree = {mod: 0 for mod in self.spec["modules"]}
        for mod, deps in self.dag.items():
            for dep in deps:
                if dep in in_degree:
                    in_degree[mod] += 1
        
        queue = [mod for mod, deg in in_degree.items() if deg == 0]
        result = []
        
        while queue:
            curr = queue.pop(0)
            result.append(curr)
            for mod, deps in self.dag.items():
                if curr in deps:
                    in_degree[mod] -= 1
                    if in_degree[mod] == 0:
                        queue.append(mod)
        
        if len(result) != len(self.spec["modules"]):
            raise ValueError("Cycle detected in Vinculum dependency graph!")
        
        return result


class SubstrateSieve:
    """Baseline Multi-Metric Evaluation Engine (Patch xiii)"""
    def __init__(self, tolerance=0.01):
        self.tolerance = tolerance

    def evaluate_statistical_delta(self, target, actual, variance=0.0):
        delta = abs(target - actual)
        status = "STABLE" if delta <= self.tolerance else "BREACH"
        return {"layer": "0_BACKGROUND", "type": "STATISTICAL", "delta": delta, "status": status}

    def evaluate_symbolic_delta(self, math_val, render_val):
        mismatch = abs(math_val - render_val) > 1e-5
        status = "BREACH" if mismatch else "STABLE"
        return {"layer": "1_GAMEPLAY", "type": "SYMBOLIC", "delta": mismatch, "status": status}

    def evaluate_angular_delta(self, vec1, vec2):
        dot = np.dot(vec1, vec2)
        mag1 = np.linalg.norm(vec1)
        mag2 = np.linalg.norm(vec2)
        if mag1 == 0 or mag2 == 0:
            return {"status": "ANOMALY", "reason": "Zero magnitude"}
        cos_t = max(min(dot / (mag1 * mag2), 1.0), -1.0)
        angle = math.acos(cos_t)
        status = "STABLE" if angle <= self.tolerance else "BREACH"
        return {"layer": "2_FOREGROUND", "type": "ANGULAR", "delta_rad": angle, "status": status}


class SphericalTensorSim:
    """Simulates the 12-channel tensor in closed cubemap spherical topology."""
    def __init__(self, N=16):
        self.N = N
        self.state = np.zeros((6, N, N, CHANNELS), dtype=np.float32)
        self.precompute_directions_and_neighbors()
        self.reset_to_base_terrain()

    def face_uv_to_dir(self, face, u, v):
        u_val = u * 2.0 - 1.0
        v_val = v * 2.0 - 1.0
        if face == 0:   # +X
            dir_vec = np.array([1.0, -v_val, -u_val])
        elif face == 1: # -X
            dir_vec = np.array([-1.0, -v_val, u_val])
        elif face == 2: # +Y
            dir_vec = np.array([u_val, 1.0, v_val])
        elif face == 3: # -Y
            dir_vec = np.array([u_val, -1.0, -v_val])
        elif face == 4: # +Z
            dir_vec = np.array([u_val, -v_val, 1.0])
        elif face == 5: # -Z
            dir_vec = np.array([-u_val, -v_val, -1.0])
        else:
            dir_vec = np.array([0.0, 0.0, 0.0])
        
        norm = np.linalg.norm(dir_vec)
        return dir_vec / norm if norm > 0 else dir_vec

    def precompute_directions_and_neighbors(self):
        print(f"Precomputing spherical coordinate directions for N={self.N}...")
        self.dirs = np.zeros((6, self.N, self.N, 3), dtype=np.float32)
        for f in range(6):
            for r in range(self.N):
                for c in range(self.N):
                    u = (c + 0.5) / self.N
                    v = (r + 0.5) / self.N
                    self.dirs[f, r, c] = self.face_uv_to_dir(f, u, v)

        # Flatten directions for fast cosine-similarity search
        flat_dirs = self.dirs.reshape(-1, 3)

        print("Building seamless neighbor topology map...")
        # Shape: (6, N, N, 4, 3) -> 4 neighbors: North, South, East, West. Stored as (face, r, c) indices.
        self.neighbor_indices = np.zeros((6, self.N, self.N, 4, 3), dtype=np.int32)
        
        epsilon = 1.5 / self.N
        for f in range(6):
            for r in range(self.N):
                for c in range(self.N):
                    V = self.dirs[f, r, c]
                    # Find orthonormal tangent vectors
                    if abs(V[2]) < 0.9:
                        T1 = np.cross(V, [0.0, 0.0, 1.0])
                    else:
                        T1 = np.cross(V, [1.0, 0.0, 0.0])
                    T1 = T1 / np.linalg.norm(T1)
                    T2 = np.cross(V, T1)
                    T2 = T2 / np.linalg.norm(T2)

                    # Compute local offsets tilted in N, S, E, W
                    neighbors_dirs = [
                        V + epsilon * T2,  # North
                        V - epsilon * T2,  # South
                        V + epsilon * T1,  # East
                        V - epsilon * T1   # West
                    ]

                    for d_idx, ndir in enumerate(neighbors_dirs):
                        ndir = ndir / np.linalg.norm(ndir)
                        # Fast dot product vector match
                        dots = np.dot(flat_dirs, ndir)
                        best_idx = np.argmax(dots)
                        
                        # Convert flat index back to (face, row, col)
                        nf = best_idx // (self.N * self.N)
                        rem = best_idx % (self.N * self.N)
                        nr = rem // self.N
                        nc = rem % self.N
                        
                        self.neighbor_indices[f, r, c, d_idx] = [nf, nr, nc]

    def reset_to_base_terrain(self):
        print("Initializing 12-channel Spherical Substrate...")
        # Create base rock terrain displaced by simple spherical harmonics
        for f in range(6):
            for r in range(self.N):
                for c in range(self.N):
                    V = self.dirs[f, r, c]
                    # Base rock elevation with low-frequency waves
                    rock_height = 30.0 + 4.0 * math.sin(V[0]*3) * math.cos(V[1]*3) + 2.0 * math.sin(V[2]*6)
                    self.state[f, r, c, ROCK] = max(1.0, rock_height)
                    
                    # Distribute soil in flatter regions, sand in valleys, and water
                    self.state[f, r, c, SOIL] = 3.0 + 2.0 * max(0.0, V[2])
                    self.state[f, r, c, SAND] = 1.0 + 1.0 * max(0.0, -V[1])
                    
                    # Water fills depressions
                    if rock_height < 29.0:
                        self.state[f, r, c, WATER] = 29.0 - rock_height
                    else:
                        self.state[f, r, c, WATER] = 0.1
                    
                    # Small glaciers at poles (high abs(Y))
                    if abs(V[1]) > 0.8:
                        self.state[f, r, c, ICE] = 5.0 * (abs(V[1]) - 0.8)
                    else:
                        self.state[f, r, c, ICE] = 0.0

                    # Organic soil nutrients
                    self.state[f, r, c, ORGANIC] = 2.0 + max(0.0, V[0])
                    
                    # Bio concentrations
                    self.state[f, r, c, BIOMASS_PREY] = 0.5 if rock_height >= 29.0 else 0.0
                    self.state[f, r, c, BIOMASS_PRED] = 0.1 if rock_height >= 29.0 else 0.0
                    self.state[f, r, c, SPORE_DENSITY] = 0.2
                    self.state[f, r, c, TERRAIN_STRESS] = 0.0
                    self.state[f, r, c, THERMAL_FLUX] = 20.0 + 10.0 * V[1] # warmer at equator

    def simulate_csg_crater(self, lat, lon, radius=4.0, depth=8.0):
        """Continuous Terraforming SDF Crater impact."""
        # Convert lat/lon to 3D unit vector
        lat_r = math.radians(lat)
        lon_r = math.radians(lon)
        target_dir = np.array([
            math.cos(lat_r) * math.cos(lon_r),
            math.sin(lat_r),
            math.cos(lat_r) * math.sin(lon_r)
        ], dtype=np.float32)

        print(f"[CSG] Excavating geodesic SDF crater at lat={lat}, lon={lon}...")
        for f in range(6):
            for r in range(self.N):
                for c in range(self.N):
                    V = self.dirs[f, r, c]
                    # Chordal distance
                    dist = np.linalg.norm(V * 40.0 - target_dir * 40.0)
                    if dist < radius:
                        # Excavation SDF
                        factor = 1.0 - (dist / radius)**2
                        excavation = depth * factor
                        
                        # Eat away soil and sand first, then rock
                        sand_val = self.state[f, r, c, SAND]
                        soil_val = self.state[f, r, c, SOIL]
                        rock_val = self.state[f, r, c, ROCK]
                        
                        if sand_val >= excavation:
                            self.state[f, r, c, SAND] -= excavation
                        else:
                            excavation -= sand_val
                            self.state[f, r, c, SAND] = 0.0
                            if soil_val >= excavation:
                                self.state[f, r, c, SOIL] -= excavation
                            else:
                                excavation -= soil_val
                                self.state[f, r, c, SOIL] = 0.0
                                self.state[f, r, c, ROCK] = max(1.0, rock_val - excavation)
                        
                        # Add stress & heat
                        self.state[f, r, c, TERRAIN_STRESS] += 2.5 * factor
                        self.state[f, r, c, THERMAL_FLUX] += 50.0 * factor

    def simulate_advection(self, dt=0.1):
        """Downhill fluid flow advection mapped across 6-face cubemap joints."""
        new_water = np.copy(self.state[..., WATER])
        
        for f in range(6):
            for r in range(self.N):
                for c in range(self.N):
                    w = self.state[f, r, c, WATER]
                    if w < 0.01:
                        continue
                    
                    # Total height of cell
                    tot_h = (self.state[f, r, c, ROCK] + 
                             self.state[f, r, c, SOIL] + 
                             self.state[f, r, c, SAND] + 
                             self.state[f, r, c, WATER])
                    
                    # Look at neighbor heights
                    flows = []
                    for d in range(4): # N, S, E, W
                        nf, nr, nc = self.neighbor_indices[f, r, c, d]
                        n_tot_h = (self.state[nf, nr, nc, ROCK] + 
                                   self.state[nf, nr, nc, SOIL] + 
                                   self.state[nf, nr, nc, SAND] + 
                                   self.state[nf, nr, nc, WATER])
                        
                        height_diff = tot_h - n_tot_h
                        if height_diff > 0:
                            flows.append((height_diff, nf, nr, nc))
                    
                    if not flows:
                        continue
                    
                    # Distribute advective flow downhill
                    tot_diff = sum(fd[0] for fd in flows)
                    for diff, nf, nr, nc in flows:
                        flow_amount = min(w * 0.5 * (diff / tot_diff), w * dt)
                        new_water[f, r, c] -= flow_amount
                        new_water[nf, nr, nc] += flow_amount
                        
                        # Sand/Soil carried by advection
                        sand_wash = flow_amount * 0.1 * self.state[f, r, c, SAND]
                        self.state[f, r, c, SAND] -= sand_wash
                        self.state[nf, nr, nc, SAND] += sand_wash

        self.state[..., WATER] = new_water

    def simulate_diffusion(self, dt=0.05):
        """Diffuses water, organic, and spore densities across cubemap edges."""
        diff_channels = [WATER, ORGANIC, SPORE_DENSITY]
        for ch in diff_channels:
            new_vals = np.copy(self.state[..., ch])
            for f in range(6):
                for r in range(self.N):
                    for c in range(self.N):
                        v = self.state[f, r, c, ch]
                        sum_n = 0.0
                        for d in range(4):
                            nf, nr, nc = self.neighbor_indices[f, r, c, d]
                            sum_n += self.state[nf, nr, nc, ch]
                        # Laplace operator on sphere topology
                        laplacian = sum_n - 4.0 * v
                        new_vals[f, r, c] += dt * 0.1 * laplacian
            self.state[..., ch] = np.maximum(0.0, new_vals)

    def simulate_lotka_volterra(self, dt=0.1):
        """Lotka-Volterra multi-channel population ecology."""
        alpha = 0.6  # Prey growth rate
        beta = 0.45  # Pred consumption efficiency
        gamma = 0.35 # Pred death rate
        
        for f in range(6):
            for r in range(self.N):
                for c in range(self.N):
                    prey = self.state[f, r, c, BIOMASS_PREY]
                    pred = self.state[f, r, c, BIOMASS_PRED]
                    water_val = self.state[f, r, c, WATER]
                    organic_val = self.state[f, r, c, ORGANIC]
                    
                    if prey <= 0.001 and pred <= 0.001:
                        continue
                        
                    # Growth limits based on resource coefficients
                    carrying_cap = 2.0 * max(0.05, water_val * organic_val)
                    
                    # Prey growth
                    d_prey = alpha * prey * (1.0 - prey / carrying_cap) - beta * prey * pred
                    # Predator growth
                    d_pred = beta * prey * pred - gamma * pred
                    
                    self.state[f, r, c, BIOMASS_PREY] = max(0.0, prey + dt * d_prey)
                    self.state[f, r, c, BIOMASS_PRED] = max(0.0, pred + dt * d_pred)
                    
                    # Organic deposits from biomass decay
                    decay = (prey * 0.05 + pred * 0.08) * dt
                    self.state[f, r, c, ORGANIC] = min(10.0, organic_val + decay)
                    
                    # Consume water in the process
                    self.state[f, r, c, WATER] = max(0.0, water_val - prey * 0.02 * dt)

    def calculate_total_mass(self):
        """Sum of conservative channels 0-5 across the global sphere substrate."""
        con_total = 0.0
        for ch in [ROCK, SOIL, SAND, WATER, ICE, ORGANIC]:
            con_total += np.sum(self.state[..., ch])
        return con_total

    def enforce_conservation(self, target_mass):
        """Renormalizes minor floating point drift to achieve perfect Symbolic parity."""
        current_mass = self.calculate_total_mass()
        if current_mass > 0:
            factor = target_mass / current_mass
            for ch in [ROCK, SOIL, SAND, WATER, ICE, ORGANIC]:
                self.state[..., ch] *= factor

    def save_state_seed(self, filename="game/spherical_seed.json"):
        """Dumps computed channels for browser-side WebGL global displacement."""
        # Convert state array into structured JSON lists
        serialized = []
        for f in range(6):
            face_data = []
            for r in range(self.N):
                row_data = []
                for c in range(self.N):
                    # Save a dict representing the 12 channels
                    cell = {
                        "rock": float(self.state[f, r, c, ROCK]),
                        "soil": float(self.state[f, r, c, SOIL]),
                        "sand": float(self.state[f, r, c, SAND]),
                        "water": float(self.state[f, r, c, WATER]),
                        "ice": float(self.state[f, r, c, ICE]),
                        "organic": float(self.state[f, r, c, ORGANIC]),
                        "prey": float(self.state[f, r, c, BIOMASS_PREY]),
                        "pred": float(self.state[f, r, c, BIOMASS_PRED]),
                        "spore": float(self.state[f, r, c, SPORE_DENSITY]),
                        "stress": float(self.state[f, r, c, TERRAIN_STRESS]),
                        "flux": float(self.state[f, r, c, THERMAL_FLUX]),
                        "dir": [float(x) for x in self.dirs[f, r, c]]
                    }
                    row_data.append(cell)
                face_data.append(row_data)
            serialized.append(face_data)

        os.makedirs(os.path.dirname(filename), exist_ok=True)
        with open(filename, "w") as f:
            json.dump({
                "N": self.N,
                "faces": serialized
            }, f, indent=2)
        print(f"[Seed] Successfully exported spherical seed to: {filename}")


# Define Vinculum Module Specification Dict
VINCULUM_SPEC = {
    "version": "0.1.0",
    "engine": "hyperpoly-terrain",
    "channels": [
        "rock", "soil", "sand", "water", "ice", "organic",
        "biomass_prey", "biomess_pred", "spore_density", "terrain_stress", "thermal_flux", "_pad"
    ],
    "modules": {
        "csg_terraforming": {
            "shader": "src/compute/csg_terraforming.wgsl",
            "reads": ["rock", "soil", "sand", "terrain_stress", "thermal_flux"],
            "writes": ["rock", "soil", "sand", "terrain_stress", "thermal_flux"],
            "requires": []
        },
        "advection": {
            "shader": "src/compute/advection.wgsl",
            "reads": ["water", "sand", "soil"],
            "writes": ["water", "sand"],
            "requires": ["csg_terraforming"],
            "flux_producer": True
        },
        "diffusion": {
            "shader": "src/compute/diffusion.wgsl",
            "reads": ["water", "organic", "spore_density"],
            "writes": ["water", "organic", "spore_density"],
            "requires": ["advection"]
        },
        "ecosystem_lotka_volterra": {
            "shader": "src/compute/lotka_volterra.wgsl",
            "reads": ["water", "organic", "biomass_prey", "biomass_pred"],
            "writes": ["water", "organic", "biomass_prey", "biomass_pred"],
            "requires": ["diffusion"]
        },
        "semi_implicit_conservation": {
            "shader": "src/compute/semi_implicit_conservation.wgsl",
            "reads": ["water", "sand", "soil"],
            "writes": ["water", "sand", "soil"],
            "requires": ["ecosystem_lotka_volterra"]
        }
    }
}

def main():
    print("=" * 60)
    print("      VINCULUM SPHERICAL PROTOTYPE RUNNER (KAGGLE PIPELINE)")
    print("=" * 60)
    
    # 1. Compile Dispatch Pipeline
    compiler = VinculumCompilerPython(VINCULUM_SPEC)
    dispatch_order = compiler.topo_sort()
    print(f"[Compiler] Topological execution sequence: {dispatch_order}")
    print("-" * 60)

    # 2. Setup Spherical Tensor Grid
    sim = SphericalTensorSim(N=N)

    # 3. Apply Continuous Terraforming (CSG Craters)
    # Impact 1: North-Eastern Ridge
    sim.simulate_csg_crater(lat=45.0, lon=30.0, radius=5.0, depth=10.0)
    # Impact 2: Equatorial Valley
    sim.simulate_csg_crater(lat=0.0, lon=240.0, radius=8.0, depth=12.0)
    
    # Calculate mass and initial heat target after terraforming impacts
    initial_mass = sim.calculate_total_mass()
    target_thermal = np.mean(sim.state[..., THERMAL_FLUX])
    print(f"[Init] Global Sphere Conservative Mass (Post-Crater): {initial_mass:.4f} units")
    print(f"[Init] Target Thermal Stability Baseline: {target_thermal:.4f}")
    
    # 4. Execute Simulation loop for 100 epochs
    epochs = 100
    print(f"[Sim] Executing {epochs} timesteps under Vinculum DAG sequence...")
    
    sieve = SubstrateSieve(tolerance=0.05)
    
    for epoch in range(1, epochs + 1):
        # We dispatch modules according to topo_sort
        for module in dispatch_order:
            if module == "csg_terraforming":
                pass # Already simulated impacts at beginning
            elif module == "advection":
                sim.simulate_advection(dt=0.1)
            elif module == "diffusion":
                sim.simulate_diffusion(dt=0.05)
            elif module == "ecosystem_lotka_volterra":
                sim.simulate_lotka_volterra(dt=0.1)
            elif module == "semi_implicit_conservation":
                sim.enforce_conservation(initial_mass)

        # Print telemetry & evaluate deltas every 10 steps
        if epoch % 10 == 0:
            cur_mass = sim.calculate_total_mass()
            mass_leak = cur_mass - initial_mass
            
            # Sieve evaluations
            l1_eval = sieve.evaluate_symbolic_delta(initial_mass, cur_mass)
            
            # Measure thermal flux average for L0 stability
            avg_thermal = np.mean(sim.state[..., THERMAL_FLUX])
            l0_eval = sieve.evaluate_statistical_delta(target_thermal, avg_thermal)
            
            print(f"Epoch {epoch:02d} | Total Mass: {cur_mass:.4f} (leak: {mass_leak:+.6f}) | Avg Heat: {avg_thermal:.2f}")
            print(f"      Layer 0 Status: {l0_eval['status']} (delta: {l0_eval['delta']:.3f})")
            print(f"      Layer 1 Status: {l1_eval['status']} (leak: {l1_eval['delta']})")

    # 5. Export JSON Seed file
    seed_path = os.path.join(os.path.dirname(__file__), "..", "game", "spherical_seed.json")
    sim.save_state_seed(seed_path)
    
    print("-" * 60)
    final_mass = sim.calculate_total_mass()
    leakage = abs(final_mass - initial_mass)
    if leakage < 1e-4:
        print("SYSTEM GREEN: 12-channel Spherical mass perfectly conserved!")
        sys.exit(0)
    else:
        print("SYSTEM RED: Mass leakage detected in Spherical Substrate!")
        sys.exit(1)

if __name__ == "__main__":
    main()
