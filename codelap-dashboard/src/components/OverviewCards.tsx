import type { ReactNode } from 'react'
import type { DeviceStatus } from '../api/types.ts'
import { useNow } from '../hooks/useNow.ts'
import { formatDuration, formatHourMinute, timeAgo } from '../utils/time.ts'
import { cardTitle, headline } from '../utils/ui.ts'

type OverviewCardsProps = {
    status: DeviceStatus | null
    deviceName?: string | null
}

/** Two plain answers in one strip: is the phone connected, and how long has it been guarding. What happened is in Activity. */
export default function OverviewCards({ status, deviceName }: OverviewCardsProps) {
    const now = useNow()
    if (!status) return null

    const guarding = status.state !== 'DISARMED' && status.armed_at

    return (
        <div className="grid divide-y divide-line rounded-xl border border-line bg-card md:grid-cols-2 md:divide-x md:divide-y-0">
            <Figure
                title={deviceName || 'Phone'}
                value={
                    <span className={`inline-flex items-center gap-3 ${status.online ? 'text-ok' : 'text-warn'}`}>
                        <span className="size-3 rounded-full bg-current" />
                        {status.online ? 'Connected' : 'Not connected'}
                    </span>
                }
                detail={status.last_seen ? `Last heard from ${timeAgo(status.last_seen, now)}` : 'Not heard from yet'}
            />
            <Figure
                title="Guarding for"
                value={guarding ? formatDuration(status.armed_at!, now) : 'Off'}
                detail={guarding ? `Since ${formatHourMinute(status.armed_at!)}` : null}
            />
        </div>
    )
}

function Figure({ title, value, detail }: { title: string; value: ReactNode; detail: string | null }) {
    return (
        <section className="flex flex-col gap-1 px-6 py-5">
            <h2 className={cardTitle}>{title}</h2>
            <p className={`text-[1.95rem] leading-snug tabular-nums ${headline}`}>{value}</p>
            {detail && <p className="text-base text-muted">{detail}</p>}
        </section>
    )
}
