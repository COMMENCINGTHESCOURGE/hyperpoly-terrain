/**
 * 🌀 THE PANGEA LOOM (BIO-BRIDGE) v1.0
 * Live Client-Side Material Morpher & Species Simulator
 * Works on filling the structural gaps in the offline/static web infrastructure.
 * Translates the 12-channel Vinculum Tensor into harmonious HSL colors,
 * live terrain erosion, and ambient biological spore drifting FX.
 */

import * as THREE from 'three';

export class PangeaLoom {
    constructor(scene, terrainMesh, waterMesh, PLANET_RADIUS) {
        this.scene = scene;
        this.terrainMesh = terrainMesh;
        this.waterMesh = waterMesh;
        this.PLANET_RADIUS = PLANET_RADIUS;
        
        this.seededData = null;
        this.sporeParticles = null;
        this.time = 0.0;
        
        // Define Premium HSL Harmony Palettes (Dynamic Vectors)
        this.palette = {
            ocean: new THREE.Color('hsl(208, 80%, 22%)'),       // Deep Crystalline Cobalt
            waterPool: new THREE.Color('hsl(200, 90%, 45%)'),   // Electric Bioluminescent Cyan
            shore: new THREE.Color('hsl(42, 55%, 70%)'),        // Harmonic Warm Beige
            basalt: new THREE.Color('hsl(240, 10%, 18%)'),      // Dark Volcanic Rock
            grass: new THREE.Color('hsl(145, 65%, 32%)'),       // Emerald Prey Canopy
            hotspot: new THREE.Color('hsl(285, 95%, 52%)'),     // Glowing Predator Violet
            stress: new THREE.Color('hsl(9, 90%, 45%)'),        // Radiant Geodesic Fault Fire
            flux: new THREE.Color('hsl(36, 95%, 50%)')          // Tectonic Thermal Orange
        };
        
        this.initSporeSystem();
    }
    
    bindSeed(seededData) {
        this.seededData = seededData;
        console.log("[PangeaLoom] Structural Seed bound successfully to live simulation thread.");
    }
    
    initSporeSystem() {
        // Spawns Layer 2 Foreground Ambient FX: drifting bioluminescent spores
        const count = 300;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const velocities = [];
        
        for(let i=0; i<count; i++) {
            // Distribute on a shell slightly above the planet radius
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const r = this.PLANET_RADIUS + 3.0 + Math.random() * 8.0;
            
            positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i*3+2] = r * Math.cos(phi);
            
            sizes[i] = 0.15 + Math.random() * 0.25;
            
            // Random orbital tangent velocity
            const v = new THREE.Vector3(positions[i*3], positions[i*3+1], positions[i*3+2]).normalize();
            const tangent = new THREE.Vector3(0, 1, 0).cross(v).normalize();
            velocities.push(tangent.multiplyScalar(1.2 + Math.random() * 2.0));
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: 0x9933ff,
            size: 0.35,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.sporeParticles = new THREE.Points(geometry, material);
        this.sporeParticles.userData = { velocities };
        this.scene.add(this.sporeParticles);
        console.log("[PangeaLoom] Ambient Spore system online (Layer 2 Foreground FX).");
    }
    
    // Inverse Cubemap helper mapping unit vector to (face, u, v)
    dirToFaceUV(nx, ny, nz) {
        let absX = Math.abs(nx);
        let absY = Math.abs(ny);
        let absZ = Math.abs(nz);
        let face = 0;
        let uVal = 0, vVal = 0;

        if (absX >= absY && absX >= absZ) {
            if (nx > 0) { face = 0; uVal = -nz / nx; vVal = -ny / nx; }
            else { face = 1; uVal = nz / -nx; vVal = -ny / -nx; }
        } else if (absY >= absX && absY >= absZ) {
            if (ny > 0) { face = 2; uVal = nx / ny; vVal = nz / ny; }
            else { face = 3; uVal = nx / -ny; vVal = -nz / -ny; }
        } else {
            if (nz > 0) { face = 4; uVal = nx / nz; vVal = -ny / nz; }
            else { face = 5; uVal = -nx / -nz; vVal = -ny / -nz; }
        }

        let u = (uVal + 1.0) / 2.0;
        let v = (vVal + 1.0) / 2.0;
        return { face, u, v };
    }
    
    update(dt) {
        this.time += dt;
        
        // 1. If seed is loaded, run dynamic CPU advection-diffusion loop to animate terrain changes live
        if (this.seededData) {
            const N = this.seededData.N;
            const faces = this.seededData.faces;
            
            // Simulating a live advection/growth pass on the client
            for(let f=0; f<6; f++) {
                for(let r=0; r<N; r++) {
                    for(let c=0; c<N; c++) {
                        const cell = faces[f][r][c];
                        
                        // Lotka-Volterra growth tick
                        if (cell.prey > 0.01) {
                            const cap = 2.0 * Math.max(0.1, cell.water * cell.organic);
                            cell.prey += dt * 0.15 * cell.prey * (1.0 - cell.prey / cap) - dt * 0.1 * cell.prey * cell.pred;
                            cell.pred += dt * 0.1 * cell.prey * cell.pred - dt * 0.08 * cell.pred;
                            
                            cell.prey = Math.max(0.0, cell.prey);
                            cell.pred = Math.max(0.0, cell.pred);
                            cell.water = Math.max(0.05, cell.water - cell.prey * 0.005 * dt);
                        }
                        
                        // Dynamic water fluctuation (breathing oceans)
                        cell.water += Math.sin(this.time * 2.0 + f) * 0.01 * dt;
                    }
                }
            }
            
            // 2. Displace mesh and re-color dynamically using Premium HSL vectors
            const geo = this.terrainMesh.geometry;
            const positions = geo.attributes.position;
            const colors = geo.attributes.color.array;
            
            for(let i=0; i<positions.count; i++) {
                const vx = positions.getX(i);
                const vy = positions.getY(i);
                const vz = positions.getZ(i);
                const d = Math.sqrt(vx*vx + vy*vy + vz*vz);
                const nx = vx/d, ny = vy/d, nz = vz/d;
                
                const { face, u, v } = this.dirToFaceUV(nx, ny, nz);
                const c_idx = Math.min(N - 1, Math.max(0, Math.floor(u * N)));
                const r_idx = Math.min(N - 1, Math.max(0, Math.floor(v * N)));
                const cell = faces[face][r_idx][c_idx];
                
                // Displacement morphing
                const h = cell.rock + cell.soil + cell.sand - 30.0;
                const newD = this.PLANET_RADIUS + h;
                positions.setXYZ(i, nx*newD, ny*newD, nz*newD);
                
                // Calculate Dynamic Color interpolation
                let finalColor = this.palette.basalt.clone();
                
                if (cell.water > 0.6) {
                    finalColor.lerp(this.palette.waterPool, Math.min(1.0, (cell.water - 0.6) * 1.5));
                } else if (cell.prey > 0.4 && cell.pred > 0.05) {
                    // Pulsing bioluminescent Violet hotspot
                    const pulse = 0.8 + 0.2 * Math.sin(this.time * 4.0 + i);
                    finalColor.copy(this.palette.hotspot).multiplyScalar(pulse);
                } else if (cell.prey > 0.15) {
                    finalColor.lerp(this.palette.grass, Math.min(1.0, cell.prey * 2.0));
                } else if (cell.stress > 0.8) {
                    // Lava stress fracture pulsing
                    const glow = 0.9 + 0.1 * Math.cos(this.time * 6.0 + i);
                    finalColor.copy(this.palette.stress).multiplyScalar(glow);
                } else if (cell.flux > 24.0) {
                    finalColor.lerp(this.palette.flux, 0.8);
                } else if (cell.soil > 2.0) {
                    finalColor.lerp(this.palette.shore, 0.5);
                }
                
                colors[i*3] = finalColor.r;
                colors[i*3+1] = finalColor.g;
                colors[i*3+2] = finalColor.b;
            }
            
            geo.attributes.position.needsUpdate = true;
            geo.attributes.color.needsUpdate = true;
            geo.computeVertexNormals();
        }
        
        // 3. Animate Ambient Spore System (Orbiting & Breathing)
        if (this.sporeParticles) {
            const pos = this.sporeParticles.geometry.attributes.position.array;
            const vels = this.sporeParticles.userData.velocities;
            
            for(let i=0; i<vels.length; i++) {
                // Orbit particles around center
                pos[i*3] += vels[i].x * dt;
                pos[i*3+1] += vels[i].y * dt;
                pos[i*3+2] += vels[i].z * dt;
                
                // Keep them in orbit within the atmosphere radius
                let vx = pos[i*3], vy = pos[i*3+1], vz = pos[i*3+2];
                let d = Math.sqrt(vx*vx + vy*vy + vz*vz);
                let nx = vx/d, ny = vy/d, nz = vz/d;
                
                // Breath effect: radial oscillation
                const breath = 1.0 + 0.05 * Math.sin(this.time * 3.0 + i);
                const targetR = (this.PLANET_RADIUS + 3.0 + (i % 8)) * breath;
                
                pos[i*3] = nx * targetR;
                pos[i*3+1] = ny * targetR;
                pos[i*3+2] = nz * targetR;
            }
            this.sporeParticles.geometry.attributes.position.needsUpdate = true;
            
            // Pulsing bioluminescent material color
            const hue = (this.time * 15.0) % 360;
            this.sporeParticles.material.color.setHSL(hue / 360.0, 0.9, 0.65);
        }
    }
}
