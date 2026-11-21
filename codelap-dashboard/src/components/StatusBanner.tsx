import type { DeviceStatus, GuardState } from '../api/types.ts'
import { alertLabel } from '../utils/alerts.ts'
import { formatHourMinute, formatTime } from '../utils/time.ts'

type StatusBannerProps = {
    status: DeviceStatus | null
}

const styles: Record<GuardState, string> = {
    DISARMED: 'border-line bg-card text-muted',
    GUARDING: 'border-ok bg-ok-soft text-ok',
    ALERT: 'border-alert bg-alert text-white motion-safe:animate-pulse',
}

function headline({ state, armed_at, last_alert }: DeviceStatus) {
    switch (state) {
        case 'DISARMED':
            return 'Not guarding'
        case 'GUARDING':
            return armed_at ? `Guarding since ${formatHourMinute(armed_at)}` : 'Guarding'
        case 'ALERT':
            return last_alert
                ? `${alertLabel(last_alert)} at ${formatTime(last_alert.timestamp)}`
                : 'Picked up'
    }
}

export default function StatusBanner({ status }: StatusBannerProps) {
    if (!status) return null

    return (
        <section
            role="status"
            className={`rounded-2xl border-2 px-6 py-10 text-center ${styles[status.state]}`}
        >
            <p className="text-5xl font-semibold tracking-tight">{headline(status)}</p>
        </section>
    )
}
