"""
Semantic Tensor Mapping for MANIFOLD Continuity Engine.

Maps the physical 6-channel terrain tensor to a lexical semantic tensor.
Physical: [Density, Cohesion, Permeability, Water, Sediment, Oxidation]
Semantic: [Function, Structure, Flexibility, Mobility, Capacity, Comfort]
"""

SEMANTIC_CHANNELS = {
    0: "Function",    # Utilitarian core (Density)
    1: "Structure",   # Rigidity, alignment of purpose (Cohesion)
    2: "Flexibility", # Adaptability to contexts (Permeability)
    3: "Mobility",    # Ease of movement (Water / Mobile Phase)
    4: "Capacity",    # Volume, ability to hold mass (Sediment)
    5: "Comfort",     # Softness, degradation of rigid bounds (Oxidation)
}

def decode_tensor(vector: list[float]) -> dict[str, float]:
    """Decodes a 6-channel tensor into its semantic dictionary mapping."""
    return {SEMANTIC_CHANNELS[i]: round(val, 3) for i, val in enumerate(vector)}
