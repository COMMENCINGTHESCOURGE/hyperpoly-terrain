import json
import math
import os
from tensor_mapping import decode_tensor

# The cohesion channel index is 1 (Structure)
COHESION_IDX = 1

def load_concepts():
    path = os.path.join(os.path.dirname(__file__), 'concepts.json')
    with open(path, 'r') as f:
        return json.load(f)

def cohesion_weighted_blend(tensor_a: list[float], tensor_b: list[float]) -> list[float]:
    """
    Blends two 6-channel semantic tensors using a cohesion-weighted average.
    This simulates the QEF solver logic: structurally sound concepts (high cohesion)
    exert more pull on the emergent tensor.
    """
    weight_a = tensor_a[COHESION_IDX]
    weight_b = tensor_b[COHESION_IDX]
    total_weight = weight_a + weight_b
    
    if total_weight == 0:
        weight_a = 0.5
        weight_b = 0.5
        total_weight = 1.0

    blended = []
    for i in range(6):
        val = (tensor_a[i] * weight_a + tensor_b[i] * weight_b) / total_weight
        # Bound to [0.0, 1.0] per MANIFOLD tensor specs
        val = max(0.0, min(1.0, val))
        blended.append(val)
        
    return blended

def euclidean_distance(v1: list[float], v2: list[float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))

def extract_neologism(target_tensor: list[float], base_concepts: dict[str, list[float]]) -> str:
    """
    Navigates the latent semantic space to find the closest conceptual neighbors.
    Generates a compound name representing the emergent concept.
    """
    distances = []
    for name, tensor in base_concepts.items():
        dist = euclidean_distance(target_tensor, tensor)
        distances.append((dist, name))
        
    distances.sort()
    
    # Extract the top 2 closest known concepts to form the neologism
    closest_1 = distances[0][1]
    closest_2 = distances[1][1]
    
    # If the distance is extremely close to a known concept, just return that
    if distances[0][0] < 0.1:
        return closest_1.capitalize()
        
    return f"Emergent {closest_1.capitalize()}-{closest_2.capitalize()}"

def main():
    print("--- MANIFOLD Semantic Evolution Engine ---")
    concepts = load_concepts()
    
    pairs_to_blend = [
        ("chair", "beanbag"),
        ("table", "bed"),
        ("stool", "couch"),
        ("hammock", "chair")
    ]
    
    for concept_a, concept_b in pairs_to_blend:
        tensor_a = concepts[concept_a]
        tensor_b = concepts[concept_b]
        
        blended_tensor = cohesion_weighted_blend(tensor_a, tensor_b)
        emergent_name = extract_neologism(blended_tensor, concepts)
        
        print(f"\n[+] Blending: {concept_a.upper()} + {concept_b.upper()}")
        print(f"    Emergent Artifact: {emergent_name}")
        
        decoded = decode_tensor(blended_tensor)
        print("    Latent Semantic Tensor:")
        for k, v in decoded.items():
            print(f"      {k}: {v:.3f}")

if __name__ == "__main__":
    main()
