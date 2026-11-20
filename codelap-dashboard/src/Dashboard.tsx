import { getMe, getMyEvents, POLL_SECONDS } from './api'
import Header from './Header'
import PhoneCard from './PhoneCard'
import { usePolling } from './usePolling'
import ReadingsPanel from './ReadingsPanel'

interface Props {
    onUnpair: () => void
}

export default function Dashboard({ onUnpair }: Props) {
    const me = usePolling(getMe, POLL_SECONDS, onUnpair)
    const events = usePolling(() => getMyEvents(50), POLL_SECONDS, onUnpair)

    const backendDown = me.error !== null || events.error !== null

    return (
        <div className="min-h-screen">
            <Header lastRefreshed={me.lastRefreshed} onUnpair={onUnpair} />

            {backendDown && (
                <div role="alert" className="bg-red-600 px-6 py-2 text-sm text-white">
                    Backend unreachable, retrying…
                </div>
            )}

            <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
                <PhoneCard me={me.data} />
                <ReadingsPanel events={events.data?.events ?? null} />
            </main>
        </div>
    )
}