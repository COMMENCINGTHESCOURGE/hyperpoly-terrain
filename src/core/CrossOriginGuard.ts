// hyperpoly-terrain/src/core/CrossOriginGuard.ts

export function assertIsolated(): void {
    if (typeof crossOriginIsolated === 'undefined' || !crossOriginIsolated) {
        throw new Error(
            'COOP/COEP isolation failed. SharedArrayBuffer & Atomics disabled. ' +
            'Verify deployment headers (vercel.json) or run local proxy.'
        );
    }

    const precision = performance.now().toString().split('.')[1]?.length || 0;
    if (precision < 5) {
        console.warn('[CrossOriginGuard] High-resolution timers degraded. COOP/COEP partially applied.');
    } else {
        console.log('[CrossOriginGuard] Isolation confirmed. SharedArrayBuffer unlocked.');
    }
}
