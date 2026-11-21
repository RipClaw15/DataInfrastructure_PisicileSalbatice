import { PAIRING, isFixtureMode } from '../api/consts.ts'
import { formatTime } from '../utils/time.ts'

type HeaderProps = {
    lastRefreshed: Date | null
    stale: boolean
    onUnpair: () => void
}

const pill = 'inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-sm'

// The landing page's hexagon mark (.sp-mark in src/styles/landing.css).
const mark =
    'grid h-9 w-8 place-items-center bg-accent text-lg text-[#0c1620] [clip-path:polygon(50%_0,100%_17%,100%_66%,50%_100%,0_66%,0_17%)]'

export default function Header({ lastRefreshed, stale, onUnpair }: HeaderProps) {
    return (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
            <h1>
                <a href="/" className="inline-flex items-center gap-2.5 text-2xl font-[750] tracking-[-0.05em]">
                    <span className={mark} aria-hidden="true">S</span>
                    StayPut
                </a>
            </h1>
            <div className="flex flex-wrap items-center gap-2">
                {isFixtureMode && <span className={`${pill} text-muted`}>Sample data</span>}
                <span className={pill} title="Last refreshed">
                    <span className={`size-2 rounded-full ${stale ? 'bg-warn' : 'bg-ok'}`} />
                    {lastRefreshed ? `Updated ${formatTime(lastRefreshed)}` : 'Connecting…'}
                </span>
                {PAIRING && (
                    <button onClick={onUnpair} className={`${pill} cursor-pointer hover:bg-page`}>
                        Unpair
                    </button>
                )}
            </div>
        </header>
    )
}
