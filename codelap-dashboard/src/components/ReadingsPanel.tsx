import type { Alert, Reading } from '../api/types.ts'
import ReadingsChart from './ReadingsChart.tsx'
import ReadingsTable from './ReadingsTable.tsx'

type ReadingsPanelProps = {
    events: Reading[] | null
    armedAt: string | null
    alerts: Alert[]
}

export default function ReadingsPanel({ events, armedAt, alerts }: ReadingsPanelProps) {
    if (!events) return null

    if (events.length === 0) {
        return (
            <section className="rounded-xl border border-dashed border-line p-10 text-center text-muted">
                No readings yet. Tap Send on the phone.
            </section>
        )
    }

    return (
        <>
            <ReadingsChart events={events} armedAt={armedAt} alerts={alerts} />
            <ReadingsTable events={events} />
        </>
    )
}
