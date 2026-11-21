import { API_URL, isFixtureMode } from '../api/consts.ts'
import { formatTime } from '../utils/time.ts'

type HeaderProps = {
    lastRefreshed: Date | null
    stale: boolean
    onUnpair: () => void
}

const pill = 'inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs'

export default function Header({ lastRefreshed, stale, onUnpair }: HeaderProps) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-lg font-medium">StayPut</h1>
            <div className="flex flex-wrap items-center gap-2">
                <span className={`${pill} font-mono text-muted`}>
                    {isFixtureMode ? 'FIXTURE DATA' : `LIVE: ${API_URL}`}
                </span>
                <span className={`${pill} tabular-nums`} title="Last refreshed">
                    <span className={`size-2 rounded-full ${stale ? 'bg-warn' : 'bg-ok'}`} />
                    {lastRefreshed ? formatTime(lastRefreshed) : '—'}
                </span>
                <button onClick={onUnpair} className={`${pill} cursor-pointer hover:bg-page`}>
                    Unpair
                </button>
            </div>
        </header>
    )
}