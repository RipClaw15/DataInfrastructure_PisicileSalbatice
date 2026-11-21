import type { Reading } from '../api/types.ts'

export const STILL_G = 1
export const MOVING_THRESHOLD_G = 0.15

export const isMoving = (r: Reading) => Math.abs(r.value - STILL_G) > MOVING_THRESHOLD_G

export function summarize(events: Reading[]) {
    return {
        latest: events[0],
        moving: events.filter(isMoving).length,
        total: events.length,
        peak: Math.max(...events.map((e) => e.value)),
    }
}
