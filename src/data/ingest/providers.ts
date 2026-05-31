// hyperpoly-terrain/src/data/ingest/providers.ts

export interface BBox {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
}

export interface SoilData {
    textureClass: number; // 0-1 mapped
    organicMatterFraction: number;
}

export interface RockData {
    mineralDensity: number; // 0-1 mapped
    porosity: number;
}

export interface LandCoverData {
    classification: number;
    waterContent: number;
}

export class USGSClient {
    static async getElevation(bbox: BBox, resolution: number): Promise<Float32Array> {
        console.log(`[USGS] Fetching DEM for BBox [${bbox.minLat}, ${bbox.minLon}]...`);
        // Mock response for scaffolding
        return new Float32Array(resolution * resolution).fill(0.5);
    }
}

export class CopernicusClient {
    static async getSoilTexture(bbox: BBox): Promise<SoilData> {
        console.log(`[Copernicus] Fetching soil texture...`);
        return { textureClass: 0.6, organicMatterFraction: 0.1 };
    }
}

export class KaggleDataset {
    static async getRockComposition(datasetId: string): Promise<RockData> {
        console.log(`[Kaggle] Fetching ${datasetId}...`);
        return { mineralDensity: 0.85, porosity: 0.1 };
    }
}

export class EarthEngine {
    static async getLandCover(bbox: BBox): Promise<LandCoverData> {
        console.log(`[EarthEngine] Fetching land cover...`);
        return { classification: 2, waterContent: 0.3 };
    }
}
