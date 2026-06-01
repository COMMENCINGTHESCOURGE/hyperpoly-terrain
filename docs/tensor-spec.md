# The 6-Channel Material Tensor: Formal Specification

> *"Without a formal mathematical constraint, cohesion is just philosophy. Here, it is physics."*

The core atomic unit of the MANIFOLD continuity engine is the **6-Channel Material Tensor**, $T$. Every voxel in the domain field is represented by $T$, updated at discrete time steps $t$.

$$ T = [D, C, P, W, S, O] $$

Where:
- $D$: Density
- $C$: Cohesion
- $P$: Permeability
- $W$: Water (Mobile Phase)
- $S$: Sediment (Deposited Phase)
- $O$: Oxidation / Entropy

---

## 1. Cohesion ($C$) — The Primary Constraint

**Definition:** $C$ defines the structural integrity of the field. It dictates the resistance to erosion, the probability of structural failure (landslides), and acts as the dominant weight in the QEF solver.

**Bounds:** $C \in [0.0, 1.0]$
- $C \to 0.0$: **Total Fragmentation** (sand, unconsolidated soil, uncorrelated noise)
- $C \to 1.0$: **Total Alignment** (solid granite, diamond, monolithic trust)

**The Update Equation (Hydraulic Erosion Context):**
Let $E_r$ be the erosion rate of water $W$ moving at velocity $V$. Cohesion drops as kinetic energy exceeds the structural threshold.

$$ C_{t+1} = \max\left(0, C_t - \alpha \cdot \max(0, W_t \cdot |V_t| - C_t)\right) $$

*(Where $\alpha$ is the domain-specific susceptibility constant).*

---

## 2. Density ($D$)

**Definition:** The solid mass present in the voxel.
**Bounds:** $D \in [0.0, 1.0]$ (normalized per material type).
**Interaction:** When $D < \text{Threshold}$ and $C < 0.5$, the structural integrity fails, triggering a gravity collapse event.

---

## 3. Permeability ($P$)

**Definition:** The rate at which the mobile phase ($W$) can diffuse through the static phase ($D$).
**Bounds:** $P \in [0.0, 1.0]$
- $P = 0.0$: Impermeable (bedrock). Water flows *over* the surface.
- $P = 1.0$: Highly porous (gravel). Water absorbs immediately into the field.

---

## 4. Mobile Phase ($W$) / Deposited Phase ($S$)

**Conservation Law:** The sum of mass across the domain must be constant, subject to external source/sink injections.

Let $\Phi(T, t)$ be the flux operator. For every voxel $i$ and neighbor $j$:
$$ \Delta S_{i \to j} = f(W_i, V_{i \to j}, C_i) $$

Mass cannot be created or destroyed during transport:
$$ \sum_{i} (W_i + S_i)_{t+1} = \sum_{i} (W_i + S_i)_{t} $$

---

## 5. The Cohesion-Weighted QEF Solver

The Quadratic Error Function (QEF) used to extract the visual mesh relies on $C$ to preserve sharp edges where necessary. Given intersection points $p_k$ and normals $n_k$, the error function to minimize is:

$$ E(x) = \sum_k C_k (n_k \cdot (x - p_k))^2 $$

By weighting the error by Cohesion ($C_k$), the solver heavily biases the resulting vertex towards structurally sound (high cohesion) intersections, naturally forming sharp cliffs and jagged rocks, while low cohesion areas smooth out into dunes and rolling hills.
