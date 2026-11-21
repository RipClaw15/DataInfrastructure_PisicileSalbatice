import type { DeviceStatus, GuardState } from '../api/types.ts'
import { useNow } from '../hooks/useNow.ts'
import { alertLabel } from '../utils/alerts.ts'
import { formatHourMinute, timeAgo } from '../utils/time.ts'
import { headline } from '../utils/ui.ts'
import type { Axes } from '../utils/orientation.ts'
import PhoneTilt from './PhoneTilt.tsx'

type StatusHeroProps = {
    status: DeviceStatus | null
    
    rest: Axes | null
    current: Axes | null
}

const looks: Record<GuardState, string> = {
    DISARMED: 'border-line bg-card text-muted',
    GUARDING: 'border-ok/60 bg-ok-soft text-ok',
    ALERT: 'border-alert bg-alert-soft text-alert',
}


export default function StatusHero({ status, rest, current }: StatusHeroProps) {
    const now = useNow()
    if (!status) return null

    const { title, text } = describe(status, now)

    return (
        <section role="status" className={`flex items-center gap-5 rounded-2xl border-2 px-5 py-6 sm:gap-8 sm:px-8 sm:py-8 ${looks[status.state]}`}>
            <PhoneTilt state={status.state} rest={rest} current={current} />
            <div className="flex max-w-[60ch] flex-col gap-2">
                <p className={`text-[2rem] leading-tight sm:text-[3.05rem] ${headline}`}>{title}</p>
                <p className="text-lg text-ink sm:text-xl">{text}</p>
            </div>
        </section>
    )
}

function describe({ state, last_alert }: DeviceStatus, now: number) {
    switch (state) {
        case 'DISARMED':
            return {
                title: 'Not guarding',
                text: 'Arm the phone in the StayPut app and put it on your stuff.',
            }
        case 'GUARDING':
            return {
                title: 'Your stuff is safe',
                text: "If it's moved, you'll see it here.",
            }
        case 'ALERT':
            return {
                title: last_alert ? `Your phone was ${alertLabel(last_alert).toLowerCase()}` : 'Your phone was moved',
                text: `${last_alert ? `At ${formatHourMinute(last_alert.timestamp)}, ${timeAgo(last_alert.timestamp, now)}. ` : ''}The alarm stays on until you disarm it with your PIN on the phone.`,
            }
    }
}
