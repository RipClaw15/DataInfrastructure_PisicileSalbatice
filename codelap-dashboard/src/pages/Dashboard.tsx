import { getMe, getMyEvents } from '../api'
import { POLL_SECONDS } from '../api/consts.ts'
import Header from '../components/Header.tsx'
import KpiRow from '../components/KpiRow.tsx'
import ReadingsPanel from '../components/ReadingsPanel.tsx'
import { usePolling } from '../hooks/usePolling.ts'

type DashboardProps = {
    onUnpair: () => void
}

export default function Dashboard({ onUnpair }: DashboardProps) {
    const me = usePolling(getMe, POLL_SECONDS, onUnpair)
    const events = usePolling(() => getMyEvents(50), POLL_SECONDS, onUnpair)

    const backendDown = me.error !== null || events.error !== null
    const readings = events.data?.events ?? null

    return (
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
            <Header lastRefreshed={me.lastRefreshed} stale={backendDown} onUnpair={onUnpair} />

            {backendDown && (
                <div role="alert" className="rounded-xl bg-warn-soft px-4 py-2 text-warn">
                    Backend unreachable, retrying…
                </div>
            )}

            <KpiRow me={me.data} events={readings} />
            <ReadingsPanel events={readings} />
        </main>
    )
}