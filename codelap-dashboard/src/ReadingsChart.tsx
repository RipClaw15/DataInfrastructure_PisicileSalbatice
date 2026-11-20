import { useMemo, useState } from 'react'
import {
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import type { Reading } from './api'
import { formatTime } from './time'

interface Props {
    events: Reading[]
}

export default function ReadingsChart({ events }: Props) {
    const [showAxes, setShowAxes] = useState(false)

    // API is newest-first, chart wants oldest -> newest
    const data = useMemo(
        () =>
            [...events].reverse().map((e) => ({
                t: new Date(e.timestamp).getTime(),
                magnitude: e.value,
                x: e.axes.x,
                y: e.axes.y,
                z: e.axes.z,
            })),
        [events],
    )

    return (
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium uppercase tracking-wide text-gray-600">
                    Magnitude over time
                </h2>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                        type="checkbox"
                        checked={showAxes}
                        onChange={(e) => setShowAxes(e.target.checked)}
                    />
                    Show x / y / z
                </label>
            </div>

            <div className="h-80 w-full">
                <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis
                            dataKey="t"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={formatTime}
                            tick={{ fontSize: 14 }}
                        />
                        <YAxis
                            unit=" g"
                            tick={{ fontSize: 14 }}
                            domain={[(min: number) => Math.min(min, 0.5), (max: number) => Math.max(max, 1.5)]}
                            tickFormatter={(v: number) => v.toFixed(1)}
                        />
                        <Tooltip
                            labelFormatter={(t) => formatTime(new Date(t as number))}
                            formatter={(v) => (typeof v === 'number' ? `${v.toFixed(3)} g` : v)}
                        />
                        <ReferenceLine
                            y={1}
                            stroke="#6b7280"
                            strokeDasharray="6 4"
                            label={{ value: 'still', position: 'insideTopRight', fill: '#6b7280' }}
                        />
                        <Line
                            type="monotone"
                            dataKey="magnitude"
                            stroke="#2563eb"
                            strokeWidth={3}
                            dot={{ r: 3 }}
                            isAnimationActive={false}
                        />
                        {showAxes && (
                            <>
                                <Legend />
                                <Line dataKey="x" stroke="#dc2626" dot={false} isAnimationActive={false} />
                                <Line dataKey="y" stroke="#16a34a" dot={false} isAnimationActive={false} />
                                <Line dataKey="z" stroke="#9333ea" dot={false} isAnimationActive={false} />
                            </>
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}