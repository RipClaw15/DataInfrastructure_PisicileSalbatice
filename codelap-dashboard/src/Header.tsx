import { API_URL, isFixtureMode } from './api'
import { formatTime } from './time'

interface Props {
    lastRefreshed: Date | null
    onUnpair: () => void
}

export default function Header({ lastRefreshed, onUnpair }: Props) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-3">
                <h1 className="text-xl font-semibold">Stand Up</h1>
                <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">
          {isFixtureMode ? 'FIXTURE DATA' : `LIVE: ${API_URL}`}
        </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
                <span>Last refreshed: {lastRefreshed ? formatTime(lastRefreshed) : '—'}</span>
                <button
                    onClick={onUnpair}
                    className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-100"
                >
                    Unpair
                </button>
            </div>
        </header>
    )
}