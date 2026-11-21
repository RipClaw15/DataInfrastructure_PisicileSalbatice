import type { Reading } from '../api/types.ts'
import ReadingsChart from './ReadingsChart.tsx'
import ReadingsTable from './ReadingsTable.tsx'

type ReadingsPanelProps = {
    events: Reading[] | null
}

export default function ReadingsPanel({ events }: ReadingsPanelProps) {
    if (!events) return null

    if (events.length === 0) {
        return (
            <section className="rounded-xl border border-dashed border-line p-10 text-center text-muted">
                No readings yet. Tap Send on your phone.
            </section>
        )
    }

    return (
        <>
            <ReadingsChart events={events} />
            <ReadingsTable events={events} />
        </>
    )
}