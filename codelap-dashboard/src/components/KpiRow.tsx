import { Activity, Gauge, Smartphone, Waves } from 'lucide-react'
import type { Me, Reading } from '../api/types.ts'
import { useNow } from '../hooks/useNow.ts'
import { STILL_G, summarize } from '../utils/stats.ts'
import { timeAgo } from '../utils/time.ts'
import KpiCard from './KpiCard.tsx'

type KpiRowProps = {
    me: Me | null
    events: Reading[] | null
}

const DASH = '—'
const delta = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`
const Unit = () => <span className="ml-1 text-base text-muted">g</span>

export default function KpiRow({ me, events }: KpiRowProps) {
    const now = useNow()
    const stats = events && events.length > 0 ? summarize(events) : null

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
                label="Phone"
                hint="Online state is reported by the backend"
                icon={<Smartphone size={16} />}
                value={
                    me ? (
                        <span className={`inline-flex items-center gap-2 ${me.online ? 'text-ok' : 'text-warn'}`}>
                            <span className="size-2 rounded-full bg-current" />
                            {me.online ? 'Online' : 'Offline'}
                        </span>
                    ) : (
                        DASH
                    )
                }
                footer={
                    me
                        ? `${me.last_seen ? timeAgo(me.last_seen, now) : DASH} · ${me.device_name ?? me.device_id}`
                        : DASH
                }
            />

            <KpiCard
                label="Latest"
                hint="Acceleration magnitude of the newest reading. A still phone is about 1 g"
                icon={<Activity size={16} />}
                value={
                    stats ? (
                        <>
                            {stats.latest.value.toFixed(3)}
                            <Unit />
                        </>
                    ) : (
                        DASH
                    )
                }
                footer={stats ? `${delta(stats.latest.value - STILL_G)} vs still` : DASH}
            />

            <KpiCard
                label="Moving"
                hint="Readings more than 0.15 g away from still, out of the readings shown"
                icon={<Waves size={16} />}
                value={stats ? `${stats.moving}/${stats.total}` : DASH}
                footer={
                    stats && (
                        <div className="h-[3px] w-full rounded-full bg-line">
                            <div
                                className="h-full rounded-full bg-accent"
                                style={{ width: `${(stats.moving / stats.total) * 100}%` }}
                            />
                        </div>
                    )
                }
            />

            <KpiCard
                label="Peak"
                hint="Highest magnitude among the readings shown"
                icon={<Gauge size={16} />}
                value={
                    stats ? (
                        <>
                            {stats.peak.toFixed(3)}
                            <Unit />
                        </>
                    ) : (
                        DASH
                    )
                }
                footer={stats ? `${delta(stats.peak - STILL_G)} vs still` : DASH}
            />
        </div>
    )
}