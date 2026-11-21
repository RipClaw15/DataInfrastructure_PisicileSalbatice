import { useEffect } from 'react'
import { PAIRING, isFixtureMode } from '../api/consts.ts'
import { formatTime } from '../utils/time.ts'

type HeaderProps = {
    lastRefreshed: Date | null
    onUnpair: () => void
}

const pill = 'inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-sm'


const mark =
    'grid h-9 w-8 place-items-center bg-accent text-lg text-[#0c1620] [clip-path:polygon(50%_0,100%_17%,100%_66%,50%_100%,0_66%,0_17%)]'

export default function Header({ lastRefreshed, onUnpair }: HeaderProps) {
    useEffect(() => {
        if (lastRefreshed) console.log(`Updated ${formatTime(lastRefreshed)}`)
    }, [lastRefreshed])

    return (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
            <h1>
                <a href="/" className="inline-flex items-center gap-2.5 text-2xl font-[750] tracking-[-0.05em]">
                    <span className={mark} aria-hidden="true">S</span>
                    StayPut
                </a>
            </h1>
            <div className="flex flex-wrap items-center gap-3">
                {isFixtureMode && <span className={`${pill} text-muted`}>Sample data</span>}
                {PAIRING && (
                    <button onClick={onUnpair} className={`${pill} cursor-pointer hover:bg-page`}>
                        Unpair
                    </button>
                )}
                <div className="flex flex-col items-end gap-2">
                    <img
                        src="https://upload.wikimedia.org/wikipedia/commons/b/b7/Porsche_Wordmark_Logo_Black.svg"
                        width="1800"
                        height="120"
                        alt="Porsche"
                        className="h-auto w-[120px] brightness-0 invert"
                    />
                    <span className="text-xs font-semibold text-[#7c9aaf]">Hackathon project</span>
                </div>
            </div>
        </header>
    )
}