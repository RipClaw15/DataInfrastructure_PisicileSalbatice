import type { Reading } from './api'
import { formatTime } from './time'

interface Props {
    events: Reading[]
}

export default function ReadingsTable({ events }: Props) {
    return (
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 p-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-600">
                Readings
            </h2>

            <div className="max-h-96 overflow-auto">
                <table className="w-full text-right font-mono text-base">
                    <thead className="sticky top-0 bg-white text-sm uppercase text-gray-600">
                    <tr className="border-b border-gray-200">
                        <th className="py-2 text-left font-medium">Time</th>
                        <th className="py-2 font-medium">X</th>
                        <th className="py-2 font-medium">Y</th>
                        <th className="py-2 font-medium">Z</th>
                        <th className="py-2 font-medium">Magnitude</th>
                        <th className="py-2 font-medium">Received at</th>
                    </tr>
                    </thead>
                    <tbody>
                    {events.map((e) => (
                        <tr key={e.id} className="border-b border-gray-100">
                            <td className="py-2 text-left">{formatTime(e.timestamp)}</td>
                            <td className="py-2">{e.axes.x.toFixed(3)}</td>
                            <td className="py-2">{e.axes.y.toFixed(3)}</td>
                            <td className="py-2">{e.axes.z.toFixed(3)}</td>
                            <td className="py-2 font-semibold">
                                {e.value.toFixed(3)} {e.unit}
                            </td>
                            <td className="py-2">{formatTime(e.received_at)}</td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}