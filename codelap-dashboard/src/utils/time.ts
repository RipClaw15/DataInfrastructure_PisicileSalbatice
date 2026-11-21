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