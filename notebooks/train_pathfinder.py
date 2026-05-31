# hyperpoly-terrain/notebooks/train_pathfinder.py

import tensorflow as tf
import os
import argparse

def build_model():
    """
    Builds a lightweight Convolutional Neural Network (CNN) 
    to predict traversal cost from a 6-channel material tensor.
    """
    model = tf.keras.Sequential([
        # Input layer: 256x256 spatial grid, 6 material channels
        tf.keras.layers.InputLayer(input_shape=(256, 256, 6)),
        
        # Feature extraction
        tf.keras.layers.Conv2D(32, 3, padding='same', activation='relu'),
        tf.keras.layers.MaxPooling2D(2),
        tf.keras.layers.Conv2D(64, 3, padding='same', activation='relu'),
        
        # Upsampling back to spatial resolution (optional depending on graph needs)
        tf.keras.layers.UpSampling2D(2),
        
        # Output layer: 1 channel (Predicted Cost), using softplus to ensure cost >= 0
        tf.keras.layers.Conv2D(1, 1, padding='same', activation='softplus')
    ])
    
    model.compile(optimizer='adam', loss='mse', metrics=['mae'])
    return model

def main():
    parser = argparse.ArgumentParser(description="Train Terrain-Aware ONNX Pathfinder Model")
    parser.add_argument('--dataset', type=str, default='kaggle/terrain-recognition', help='Path to Kaggle dataset')
    args = parser.parse_args()

    print(f"Loading dataset from {args.dataset}...")
    
    # Mocking Dataset for Scaffolding
    # In production: ds = tf.keras.utils.image_dataset_from_directory(...)
    print("Dataset loaded. Initializing Model...")

    model = build_model()
    model.summary()
    
    print("Training model (Mock Epochs)...")
    # model.fit(ds, epochs=20)
    
    os.makedirs('models', exist_ok=True)
    h5_path = 'models/terrain-cost-predictor.h5'
    model.save(h5_path)
    print(f"Model saved to {h5_path}")
    
    # Note: tf2onnx conversion would happen here in the pipeline:
    # python -m tf2onnx.convert --saved-model models/ --output models/terrain-cost-predictor.onnx
    print("Ready for ONNX export.")

if __name__ == "__main__":
    main()
