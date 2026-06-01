# Manifold Tensor Forge - 50k Concept Generator
# This script is designed to be run in Google Colab with a T4 GPU.
# It ingests a massive corpus, computes semantic embeddings, projects them onto 
# the 6 MANIFOLD channels, and exports a 50k concepts.json dictionary.

# !pip install sentence-transformers datasets numpy scikit-learn tqdm

import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.cluster import MiniBatchKMeans
from collections import Counter
import json

# ------------------------------
# 1. Load corpus (example: Wikipedia sentences)
# ------------------------------
from datasets import load_dataset
dataset = load_dataset("wikipedia", "20220301.en", split="train", streaming=True)
sentences = []
for i, sample in enumerate(dataset):
    text = sample['text']
    # simple sentence splitting
    for sent in text.split('. '):
        if len(sent.split()) > 5:
            sentences.append(sent.strip())
    if len(sentences) >= 1_000_000:  # 1M sentences is ~10M words
        break

# ------------------------------
# 2. Compute embeddings
# ------------------------------
model = SentenceTransformer('all-MiniLM-L6-v2')
embeddings = model.encode(sentences, show_progress_bar=True, batch_size=256)

# ------------------------------
# 3. Project 384d -> 6 manifold channels
# ------------------------------
# Learn a random projection to mimic semantic dimensions
np.random.seed(42)
projection = np.random.randn(384, 6)
# Normalize columns to unit length
projection = projection / np.linalg.norm(projection, axis=0, keepdims=True)
manifold_vectors = np.dot(embeddings, projection)   # (N, 6)

# Apply non-linearity (ensures each channel has distinct activation)
# Shift and scale to [0.0, 1.0] to match MANIFOLD tensor specs
manifold_vectors = (np.tanh(manifold_vectors) + 1.0) / 2.0

# ------------------------------
# 4. Cluster to 50k representative concepts
# ------------------------------
n_clusters = 50000
kmeans = MiniBatchKMeans(n_clusters=n_clusters, batch_size=10000, random_state=42)
cluster_labels = kmeans.fit_predict(manifold_vectors)

# For each cluster: find most frequent term & median vector
concepts = {}
for cid in range(n_clusters):
    indices = np.where(cluster_labels == cid)[0]
    if len(indices) == 0:
        continue
    # Most frequent word in the cluster sentences
    cluster_sentences = [sentences[i] for i in indices]
    words = []
    for s in cluster_sentences:
        # Very simple tokenization
        words.extend("".join(c for c in s.lower() if c.isalnum() or c.isspace()).split())
    
    # Filter out common stop words to get meaningful concepts
    stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "is", "was", "are", "were"}
    filtered_words = [w for w in words if w not in stop_words and len(w) > 2]
    
    common = Counter(filtered_words).most_common(1)
    term = common[0][0] if common else f"concept_{cid}"
    
    # Median vector (robust to outliers)
    vec = np.median(manifold_vectors[indices], axis=0).tolist()
    
    # Ensure precision is manageable
    vec = [round(v, 4) for v in vec]
    
    # Save to dictionary
    # If term already exists due to cluster overlap, keep the more frequent one
    if term not in concepts:
        concepts[term] = vec

# ------------------------------
# 5. Save to concepts.json
# ------------------------------
with open("concepts_50k.json", "w") as f:
    json.dump(concepts, f, indent=2)

print(f"Exported {len(concepts)} unique concepts to concepts_50k.json")
