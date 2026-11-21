import type { DeviceStatus, Reading } from '../api/types.ts'

export type Axes = { x: number; y: number; z: number }


export function angleBetween(a: Axes, b: Axes): number {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z
    const norms = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)
    if (norms === 0) return 0
    return (Math.acos(Math.max(-1, Math.min(1, dot / norms))) * 180) / Math.PI
}


export function restingAxes(status: DeviceStatus | null, events: Reading[] | null): Axes | null {
    if (!status?.armed_at || !events || events.length === 0) return null
    const armedAt = new Date(status.armed_at).getTime()
    const snapshot = events.find(
        (e) => e.snapshot_reason === 'armed' && Math.abs(new Date(e.timestamp).getTime() - armedAt) < 2000,
    )
    if (snapshot) return snapshot.axes
    const closest = events.reduce((best, e) =>
        Math.abs(new Date(e.timestamp).getTime() - armedAt) < Math.abs(new Date(best.timestamp).getTime() - armedAt)
            ? e
            : best,
    )
    return closest.axes
}


export function poseMatrix(axes: Axes): string {
    const len = Math.hypot(axes.x, axes.y, axes.z) || 1
    const u = [axes.x / len, -axes.y / len, axes.z / len]
    const v = [0, 1, 0]

    let q: [number, number, number, number]
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
    if (dot < -0.9999) {
        q = [1, 0, 0, 0] 
    } else {
        const c = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        const n = Math.hypot(c[0], c[1], c[2], 1 + dot)
        q = [c[0] / n, c[1] / n, c[2] / n, (1 + dot) / n]
    }
    const [x, y, z, w] = q
    const r = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    
    const m = [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, 0, 0, 0, 1]
    return `matrix3d(${m.map((n) => n.toFixed(5)).join(',')})`
}
