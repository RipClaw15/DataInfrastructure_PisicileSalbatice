import type { Reading } from './api'
import LatestReading from './LatestReading'
import ReadingsChart from "./ReadingsChart.tsx";
import ReadingsTable from "./ReadingsTable.tsx";

interface Props {
    events: Reading[] | null
}

export default function ReadingsPanel({ events }: Props) {
    if (!events) {
        return <section className="rounded-lg border border-gray-200 p-6">Loading…</section>
    }

    if (events.length === 0) {
        return (
            <section className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-600">
                No readings yet. Tap Send on your phone.
            </section>
        )
    }

    return (
        <section className="flex flex-col gap-6">
            <LatestReading reading={events[0]} />
            <ReadingsChart events={events} />
            <ReadingsTable events={events} />
        </section>
    )
}