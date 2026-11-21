import { Activity, Gauge, Smartphone, Waves } from 'lucide-react'
import type { DeviceStatus, Reading } from '../api/types.ts'
import { useNow } from '../hooks/useNow.ts'
import { MOVING_THRESHOLD_G, STILL_G, summarize } from '../utils/stats.ts'
import { timeAgo } from '../utils/time.ts'
import KpiCard from './KpiCard.tsx'

type KpiRowProps = {
    status: DeviceStatus | null
    events: Reading[] | null
}

const DASH = '—'
const delta = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`
const Unit = () => <span className="ml-1 text-base text-muted">g</span>

export default function KpiRow({ status, events }: KpiRowProps) {
    const now = useNow()
    const stats = events && events.length > 0 ? summarize(events) : null

    return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KpiCard
                label="Phone"
                hint="Online means the phone sent a reading in the last 5 minutes."
                icon={<Smartphone size={16} />}
                value={
                    status ? (
                        <span className={`inline-flex items-center gap-2 ${status.online ? 'text-ok' : 'text-warn'}`}>
                            <span className="size-2 rounded-full bg-current" />
                            {status.online ? 'Online' : 'Offline'}
                        </span>
                    ) : (
                        DASH
                    )
                }
                footer={
                    status
                        ? `${status.last_seen ? timeAgo(status.last_seen, now) : DASH} · ${status.device_id}`
                        : DASH
                }
            />

            <KpiCard
                label="Latest"
                hint="g measures how hard the phone is pushed; 1 g is Earth's gravity. A phone lying still reads about 1 g, and moving it pushes the number away from 1."
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
                hint={`How many of the ${stats ? `last ${stats.total}` : 'recent'} readings were more than ${MOVING_THRESHOLD_G} g away from 1 g. Higher means the phone was moved more.`}
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
                hint="The strongest reading in that window. Holding the phone stays near 1 g; shaking reaches 2–3 g or more."
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
