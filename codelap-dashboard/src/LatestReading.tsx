import type { Reading } from './api'
import { formatTime, timeAgo } from './time'
import { useNow } from './useNow'

interface Props {
    reading: Reading
}

export default function LatestReading({ reading }: Props) {
    const now = useNow()
    const { x, y, z } = reading.axes

    return (
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 p-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-600">
                Latest reading
            </h2>

            <p className="font-mono text-7xl font-bold">
                {reading.value.toFixed(3)}
                <span className="ml-2 text-3xl font-normal text-gray-600">{reading.unit}</span>
            </p>

            <dl className="flex gap-8 font-mono text-xl">
                {Object.entries({ x, y, z }).map(([axis, v]) => (
                    <div key={axis}>
                        <dt className="text-sm uppercase text-gray-600">{axis}</dt>
                        <dd>{v.toFixed(3)}</dd>
                    </div>
                ))}
            </dl>

            <p className="text-sm text-gray-600">
                Taken at {formatTime(reading.timestamp)} ({timeAgo(reading.timestamp, now)})
            </p>
        </div>
    )
}