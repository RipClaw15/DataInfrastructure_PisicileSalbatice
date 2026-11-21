import { getAlerts, getEvents, getLive, getMe, getStatus } from '../api'
import { ACTIVE_POLL_SECONDS, POLL_SECONDS } from '../api/consts.ts'
import type { DeviceStatus } from '../api/types.ts'
import Header from '../components/Header.tsx'
import ActivityList from '../components/ActivityList.tsx'
import OverviewCards from '../components/OverviewCards.tsx'
import StatusHero from '../components/StatusHero.tsx'
import TechnicalDetails from '../components/TechnicalDetails.tsx'
import { usePolling } from '../hooks/usePolling.ts'
import LocationMap from "../components/LocationMap.tsx";
import { restingAxes } from '../utils/orientation.ts'

type DashboardProps = {
    onUnpair: () => void
}

const isArmed = (s: DeviceStatus | null) => s !== null && s.state !== 'DISARMED'

export default function Dashboard({ onUnpair }: DashboardProps) {
    const events = usePolling(() => getEvents(50), POLL_SECONDS, onUnpair)
    const me = usePolling(() => getMe(), POLL_SECONDS, onUnpair)
    const readings = events.data?.events ?? null

    
    const status = usePolling(
        () => getStatus(),
        (s) => (isArmed(s) ? ACTIVE_POLL_SECONDS : POLL_SECONDS),
        onUnpair,
    )
    const armed = isArmed(status.data)
    const alerts = usePolling(
        () => getAlerts(),
        armed ? ACTIVE_POLL_SECONDS : POLL_SECONDS,
        onUnpair,
    )

    // The phone's newest reading, for the 3D phone; only while armed, when the phone is sending.
    const live = usePolling(() => getLive(), ACTIVE_POLL_SECONDS, onUnpair, armed)
    const rest = restingAxes(status.data, readings)
    const current = armed ? live.data?.axes ?? status.data?.last_alert?.axes ?? null : null

    const statusData = status.data
    const liveLocation = statusData?.last_location ?? null
    const armedLocation = statusData?.location ?? null

    const shownLocation =
        statusData?.state === 'ALERT' && liveLocation
            ? { location: liveLocation, label: 'Where your phone is now', alert: true }
            
            : statusData?.state !== 'DISARMED' && armedLocation
                ? { location: armedLocation, label: 'Where you left your phone', alert: false }
                
                : statusData?.state === 'DISARMED' && liveLocation
                    ? { location: liveLocation, label: 'Last known location', alert: false }
                    : { location: null, label: 'No location yet', alert: false }

    const backendDown = events.error !== null || status.error !== null || alerts.error !== null
    const alertList = alerts.data?.alerts ?? []

    return (
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 p-6">
            <Header lastRefreshed={events.lastRefreshed} stale={backendDown} onUnpair={onUnpair} />

            {backendDown && (
                <div role="alert" className="rounded-xl bg-warn-soft px-5 py-3 text-base text-warn">
                    Can't reach the server right now. Trying again…
                </div>
            )}

            <StatusHero status={status.data} rest={rest} current={current} />
            <OverviewCards status={status.data} deviceName={me.data?.device_name} />
            <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2">
                    <LocationMap
                        location={shownLocation.location}
                        label={shownLocation.label}
                        alert={shownLocation.alert}
                    />
                </div>
                <ActivityList status={status.data} alerts={alerts.data ? alertList : null} />
            </div>
            <TechnicalDetails
                status={status.data}
                events={readings}
                armedAt={armed ? status.data?.armed_at ?? null : null}
                alerts={alertList}
            />
        </main>
    )
}
