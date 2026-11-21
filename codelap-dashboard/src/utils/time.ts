export function timeAgo(iso: string, now: number): string {
    const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000))
    if (s < 60) return `${s} s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m} min ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} h ago`
    return `${Math.floor(h / 24)} d ago`
}

export const formatTime = (value: Date | string) =>
    new Date(value).toLocaleTimeString([], { hour12: false })

export const formatHourMinute = (value: Date | string) =>
    new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/** "less than a minute", "23 min", "1 h 5 min": how long something has been going on. */
export function formatDuration(fromIso: string, now: number): string {
    const m = Math.floor(Math.max(0, now - new Date(fromIso).getTime()) / 60000)
    if (m < 1) return 'less than a minute'
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`
}
