import type { Reading } from '../api/types.ts'
import { isMoving } from '../utils/stats.ts'
import { formatTime } from '../utils/time.ts'

type ReadingsTableProps = {
    events: Reading[]
}

const th = 'py-2 font-normal'
const td = 'py-2'

export default function ReadingsTable({ events }: ReadingsTableProps) {
    return (
        <section className="rounded-xl border border-line bg-card p-4">
            <h2 className="mb-2 text-muted">Readings</h2>

            <div className="max-h-96 overflow-auto">
                <table className="w-full text-right tabular-nums">
                    <thead className="sticky top-0 bg-card text-xs text-muted">
                    <tr className="border-b border-line">
                        <th className={`${th} text-left`}>Time</th>
                        <th className={th}>X</th>
                        <th className={th}>Y</th>
                        <th className={th}>Z</th>
                        <th className={th}>Magnitude</th>
                        <th className={th}>Received</th>
                    </tr>
                    </thead>
                    <tbody>
                    {events.map((e) => (
                        <tr key={e.id} className="border-b border-line/60 last:border-0">
                            <td className={`${td} text-left`}>{formatTime(e.timestamp)}</td>
                            <td className={td}>{e.axes.x.toFixed(3)}</td>
                            <td className={td}>{e.axes.y.toFixed(3)}</td>
                            <td className={td}>{e.axes.z.toFixed(3)}</td>
                            <td className={`${td} font-medium ${isMoving(e) ? 'text-accent' : ''}`}>
                                {e.value.toFixed(3)} {e.unit}
                            </td>
                            <td className={`${td} text-muted`}>{formatTime(e.received_at)}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
