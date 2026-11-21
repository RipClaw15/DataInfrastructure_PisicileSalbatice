import { useMemo, useState } from 'react'
import {
    CartesianGrid,
    Line,
    LineChart,
    ReferenceArea,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'
import type { Alert, Reading } from '../api/types.ts'
import { MOVING_THRESHOLD_G, STILL_G } from '../utils/stats.ts'
import { formatTime } from '../utils/time.ts'
import { card, cardTitle } from '../utils/ui.ts'

type ReadingsChartProps = {
    events: Reading[]
    armedAt: string | null
    alerts: Alert[]
}

type ChartTooltipProps = {
    active?: boolean
    payload?: { value?: number }[]
    label?: number
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length || label === undefined) return null
    return (
        <div className="rounded-lg bg-ink px-3 py-2 text-card">
            <p className="text-xs opacity-70">{formatTime(new Date(label))}</p>
            <p className="text-lg font-medium tabular-nums">{Number(payload[0].value).toFixed(3)} g</p>
        </div>
    )
}

const axisTick = { fontSize: 12, fill: 'var(--muted)' }

export default function ReadingsChart({ events, armedAt, alerts }: ReadingsChartProps) {
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

    const first = data[0].t
    const last = data[data.length - 1].t
    const armedFrom = armedAt ? Math.min(Math.max(new Date(armedAt).getTime(), first), last) : null

    return (
        <section className={card}>
            <div className="mb-1 flex items-center justify-between">
                <h2 className={cardTitle}>Magnitude (g)</h2>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                    <input
                        type="checkbox"
                        checked={showAxes}
                        onChange={(e) => setShowAxes(e.target.checked)}
                    />
                    x / y / z
                </label>
            </div>

            <p className="mb-4 text-xs text-muted">
                g is gravity (1 g = Earth's pull). The grey band is "still", within {MOVING_THRESHOLD_G} g of 1 g;
                the line leaves it when the phone moves.
                {armedFrom !== null && ' Blue shading: guarding.'}
                {alerts.length > 0 && ' Red line: alert.'}
            </p>

            <div className="h-72 w-full">
                <ResponsiveContainer>
                    <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                        <CartesianGrid vertical={false} stroke="var(--line)" />
                        <XAxis
                            dataKey="t"
                            type="number"
                            scale="time"
                            domain={['dataMin', 'dataMax']}
                            tickFormatter={formatTime}
                            tick={axisTick}
                            tickLine={false}
                            axisLine={false}
                        />
                        <YAxis
                            tick={axisTick}
                            tickLine={false}
                            axisLine={false}
                            domain={[(min: number) => Math.min(min, 0.5), (max: number) => Math.max(max, 1.5)]}
                            tickFormatter={(v: number) => v.toFixed(1)}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--line)' }} />
                        {armedFrom !== null && (
                            <ReferenceArea x1={armedFrom} x2={last} fill="var(--ok)" fillOpacity={0.12} />
                        )}
                        <ReferenceArea
                            y1={STILL_G - MOVING_THRESHOLD_G}
                            y2={STILL_G + MOVING_THRESHOLD_G}
                            fill="var(--line)"
                            fillOpacity={0.5}
                        />
                        <ReferenceLine
                            y={STILL_G}
                            stroke="var(--muted)"
                            strokeDasharray="4 4"
                            label={{ value: 'still', position: 'insideTopRight', fill: 'var(--muted)', fontSize: 12 }}
                        />
                        {alerts.map((a) => (
                            <ReferenceLine
                                key={a.id}
                                x={new Date(a.timestamp).getTime()}
                                stroke="var(--alert)"
                                strokeWidth={2}
                            />
                        ))}
                        {showAxes && (
                            <>
                                <Line dataKey="x" stroke="#9ca3af" strokeWidth={1} dot={false} isAnimationActive={false} />
                                <Line dataKey="y" stroke="#9ca3af" strokeWidth={1.2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                                <Line dataKey="z" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="1 3" dot={false} isAnimationActive={false} />
                            </>
                        )}
                        <Line
                            type="monotone"
                            dataKey="magnitude"
                            stroke="var(--accent)"
                            strokeWidth={2}
                            dot={{ r: 2.5, fill: 'var(--accent)', strokeWidth: 0 }}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </section>
    )
}
