// hyperpoly-terrain/src/sync/SabPool.ts

export class SabPool {
    private buffer: SharedArrayBuffer;
    private views: Map<string, any>; // TypedArray
    
    constructor(sizeMB: number) {
        // Allocate raw SharedArrayBuffer chunk (1024 * 1024 bytes per MB)
        this.buffer = new SharedArrayBuffer(sizeMB * 1024 * 1024);
        this.views = new Map();
        console.log(`[SabPool] Allocated ${sizeMB}MB SharedArrayBuffer pool for tensor bridging.`);
    }
    
    /**
     * Allocates a specific TypedArray view within the massive SAB block.
     * This avoids GC allocation per frame and allows instantaneous WebWorker transfer.
     */
    allocate<T>(name: string, ctor: new (sab: SharedArrayBuffer, offset: number, length: number) => T, offset: number, length: number): T {
        const view = new ctor(this.buffer, offset, length);
        this.views.set(name, view);
        return view;
    }
    
    /**
     * Transmits the raw pointer to the WebWorker, avoiding a structured clone.
     */
    syncToWorker(worker: Worker, channel: string): void {
        worker.postMessage({ type: 'SAB_TRANSFER', buffer: this.buffer, channel });
    }
}
