import type { Alert } from '../api/types.ts'
import { alertLabel } from '../utils/alerts.ts'
import { formatTime } from '../utils/time.ts'

type AlertHistoryProps = {
    alerts: Alert[] | null
}

export default function AlertHistory({ alerts }: AlertHistoryProps) {
    if (!alerts) return null

    return (
        <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="mb-2 text-muted">Alerts</h2>

            {alerts.length === 0 ? (
                <p className="py-4 text-center text-muted">No alerts yet.</p>
            ) : (
                <ul className="max-h-64 overflow-auto tabular-nums">
                    {alerts.map((a) => (
                        <li
                            key={a.id}
                            className="grid grid-cols-3 border-b border-line/60 py-2 last:border-0"
                        >
                            <span>{formatTime(a.timestamp)}</span>
                            <span className="text-center font-medium text-warn">{alertLabel(a)}</span>
                            <span className="text-right text-muted">{Math.round(a.angle_deg)}°</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    )
}
