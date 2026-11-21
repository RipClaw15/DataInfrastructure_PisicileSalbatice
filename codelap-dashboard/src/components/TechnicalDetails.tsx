import { ChevronDown } from 'lucide-react'
import type { Alert, DeviceStatus, Reading } from '../api/types.ts'
import { cardTitle } from '../utils/ui.ts'
import KpiRow from './KpiRow.tsx'
import ReadingsPanel from './ReadingsPanel.tsx'

type TechnicalDetailsProps = {
    status: DeviceStatus | null
    events: Reading[] | null
    armedAt: string | null
    alerts: Alert[]
}

/** The sensor data (g values, chart, readings), closed by default: for demos and debugging, not for the owner. */
export default function TechnicalDetails({ status, events, armedAt, alerts }: TechnicalDetailsProps) {
    return (
        <details className="group">
            <summary className={`flex cursor-pointer list-none items-center gap-2 py-2 ${cardTitle} hover:text-ink`}>
                <ChevronDown size={18} className="transition-transform group-open:rotate-180" />
                Sensor data
            </summary>
            <div className="mt-3 flex flex-col gap-4">
                <KpiRow status={status} events={events} />
                <ReadingsPanel events={events} armedAt={armedAt} alerts={alerts} />
            </div>
        </details>
    )
}
