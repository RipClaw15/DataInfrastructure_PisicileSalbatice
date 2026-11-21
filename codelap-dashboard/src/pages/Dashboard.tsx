import { getAlerts, getEvents, getStatus } from '../api'
import { ACTIVE_POLL_SECONDS, POLL_SECONDS } from '../api/consts.ts'
import type { DeviceStatus } from '../api/types.ts'
import AlertHistory from '../components/AlertHistory.tsx'
import Header from '../components/Header.tsx'
import KpiRow from '../components/KpiRow.tsx'
import ReadingsPanel from '../components/ReadingsPanel.tsx'
import StatusBanner from '../components/StatusBanner.tsx'
import { usePolling } from '../hooks/usePolling.ts'
import LocationMap from "../components/LocationMap.tsx";

type DashboardProps = {
    onUnpair: () => void
}

const isArmed = (s: DeviceStatus | null) => s !== null && s.state !== 'DISARMED'

export default function Dashboard({ onUnpair }: DashboardProps) {
    const events = usePolling(() => getEvents(50), POLL_SECONDS, onUnpair)
    const readings = events.data?.events ?? null
    const deviceId = readings?.[0]?.device_id ?? null
    const hasDevice = deviceId !== null

    // Poll fast while armed so the alert shows up within ~1 s
    const status = usePolling(
        () => getStatus(deviceId!), // only runs when hasDevice
        (s) => (isArmed(s) ? ACTIVE_POLL_SECONDS : POLL_SECONDS),
        onUnpair,
        hasDevice,
    )
    const armed = isArmed(status.data)
    const alerts = usePolling(
        () => getAlerts(deviceId!),
        armed ? ACTIVE_POLL_SECONDS : POLL_SECONDS,
        onUnpair,
        hasDevice,
    )

    const statusData = status.data
    const liveLocation = statusData?.last_location ?? null
    const armedLocation = statusData?.location ?? null

    const shownLocation =
        statusData?.state === 'ALERT' && liveLocation
            ? { location: liveLocation, label: 'Where the phone is now', alert: true }
            : statusData?.state === 'GUARDING' && armedLocation
                ? { location: armedLocation, label: 'Armed at', alert: false }
                : null

    const backendDown = events.error !== null || status.error !== null || alerts.error !== null
    const alertList = alerts.data?.alerts ?? []

    return (
        <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
            <Header lastRefreshed={events.lastRefreshed} stale={backendDown} onUnpair={onUnpair} />

            {backendDown && (
                <div role="alert" className="rounded-xl bg-warn-soft px-4 py-2 text-warn">
                    Backend unreachable, retrying…
                </div>
            )}

            <StatusBanner status={status.data} />
            <KpiRow status={status.data} events={readings} />
            <ReadingsPanel
                events={readings}
                armedAt={armed ? status.data?.armed_at ?? null : null}
                alerts={alertList}
            />
            {shownLocation && (
                <LocationMap
                    location={shownLocation.location}
                    label={shownLocation.label}
                    alert={shownLocation.alert}
                />
            )}
            <AlertHistory alerts={alerts.data ? alertList : null} />
        </main>
    )
}
