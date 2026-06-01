// Tensor Mapping v2.0 CRDT Splitter
// 48-byte Stride -> 12 Float32 Channels

export interface Tensor12 {
    rock: number; soil: number; sand: number;
    water: number; ice: number; organic: number;
    biomass_prey: number; biomass_pred: number; spore_density: number;
    terrain_stress: number; thermal_flux: number; _pad: number;
}

export type DeltaOp = 'CONSUME' | 'PRODUCE' | 'ADD';

export interface CRDTLog {
    voxelIndex: number;
    channel: keyof Tensor12;
    op: DeltaOp;
    amount: number;
    timestamp: number;
}

export class CRDTSplitter {
    // Channels 0-5 are Conservative (must consume before produce)
    private static conservativeChannels = new Set([
        'rock', 'soil', 'sand', 'water', 'ice', 'organic'
    ]);

    // Channels 6-10 are Additive (commutative, pure math addition)
    private static additiveChannels = new Set([
        'biomass_prey', 'biomass_pred', 'spore_density', 'terrain_stress', 'thermal_flux'
    ]);

    public processDelta(log: CRDTLog) {
        if (CRDTSplitter.conservativeChannels.has(log.channel)) {
            this.handleConservativeDelta(log);
        } else if (CRDTSplitter.additiveChannels.has(log.channel)) {
            this.handleAdditiveDelta(log);
        } else {
            console.warn(`[CRDT] Ignored delta on unmapped channel: ${log.channel}`);
        }
    }

    private handleConservativeDelta(log: CRDTLog) {
        if (log.op !== 'CONSUME' && log.op !== 'PRODUCE') {
            throw new Error(`[CRDT] Invalid op ${log.op} for conservative channel ${log.channel}`);
        }
        // Logic: Add to pending consumes/produces block to ensure mass conservation across the network
        console.log(`[CRDT Conservative] ${log.op} ${log.amount} to ${log.channel} at voxel ${log.voxelIndex}`);
    }

    private handleAdditiveDelta(log: CRDTLog) {
        if (log.op !== 'ADD') {
            throw new Error(`[CRDT] Invalid op ${log.op} for additive channel ${log.channel}`);
        }
        // Logic: Commutative addition directly to the CRDT log
        console.log(`[CRDT Additive] ADD ${log.amount} to ${log.channel} at voxel ${log.voxelIndex}`);
    }
}
