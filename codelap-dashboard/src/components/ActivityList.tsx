import type { Alert, DeviceStatus } from '../api/types.ts'
import { useNow } from '../hooks/useNow.ts'
import { alertLabel } from '../utils/alerts.ts'
import { formatHourMinute, timeAgo } from '../utils/time.ts'
import { card, cardTitle } from '../utils/ui.ts'

type ActivityListProps = {
    status: DeviceStatus | null
    alerts: Alert[] | null
}

type Item = { key: string; at: string; label: string; alert: boolean }

/** What happened, newest first, as a timeline: the alerts and when the current session was armed. */
export default function ActivityList({ status, alerts }: ActivityListProps) {
    const now = useNow()
    if (!alerts) return null

    const items: Item[] = alerts.map((a) => ({ key: `alert-${a.id}`, at: a.timestamp, label: alertLabel(a), alert: true }))
    if (status?.armed_at) items.push({ key: 'armed', at: status.armed_at, label: 'Armed', alert: false })
    items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

    return (
        <section className={card}>
            <h2 className={`mb-4 ${cardTitle}`}>Activity</h2>

            {items.length === 0 ? (
                <p className="text-base text-muted">Nothing yet.</p>
            ) : (
                <ol className="relative max-h-80 overflow-auto">
                    {items.map((item, i) => (
                        <li key={item.key} className="relative flex gap-4 pb-5 last:pb-0">
                            {/* The line joining the events, stopping at the oldest. */}
                            {i < items.length - 1 && <span className="absolute top-4 left-[5px] h-full w-px bg-line" />}
                            <span className={`mt-1.5 size-[11px] shrink-0 rounded-full ${item.alert ? 'bg-alert' : 'bg-ok'}`} />
                            <div className="flex flex-col">
                                <span className={`text-lg font-semibold ${item.alert ? 'text-alert' : ''}`}>{item.label}</span>
                                <span className="text-base text-muted">
                                    {formatHourMinute(item.at)}, {timeAgo(item.at, now)}
                                </span>
                            </div>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    )
}
