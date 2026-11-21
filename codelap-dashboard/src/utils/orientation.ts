import type { DeviceStatus, Reading } from '../api/types.ts'

export type Axes = { x: number; y: number; z: number }

/** Angle between two readings' gravity directions, in degrees (the same rule the backend uses for alerts). */
export function angleBetween(a: Axes, b: Axes): number {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z
    const norms = Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z)
    if (norms === 0) return 0
    return (Math.acos(Math.max(-1, Math.min(1, dot / norms))) * 180) / Math.PI
}

/**
 * The resting position of the current session: the backend's 'armed' snapshot, or, without one
 * (sample data), the reading taken closest to when it was armed.
 */
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

/**
 * A CSS matrix3d that turns a phone drawn lying face up into the pose the reading describes:
 * the measured gravity direction ends up pointing down. Gravity can't tell which way the phone
 * faces, so this shows tilt only (picked up, tipped over), not turning on the table.
 *
 * The phone's axes (x right, y towards the top, z out of the screen) are flipped to CSS's (y down),
 * then rotated the shortest way from the gravity direction to straight down.
 */
export function poseMatrix(axes: Axes): string {
    const len = Math.hypot(axes.x, axes.y, axes.z) || 1
    const u = [axes.x / len, -axes.y / len, axes.z / len]
    const v = [0, 1, 0]

    let q: [number, number, number, number]
    const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
    if (dot < -0.9999) {
        q = [1, 0, 0, 0] // exactly upside down: half a turn about x
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
    // matrix3d is column-major
    const m = [r[0][0], r[1][0], r[2][0], 0, r[0][1], r[1][1], r[2][1], 0, r[0][2], r[1][2], r[2][2], 0, 0, 0, 0, 1]
    return `matrix3d(${m.map((n) => n.toFixed(5)).join(',')})`
}
