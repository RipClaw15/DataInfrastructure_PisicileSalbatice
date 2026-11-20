import type { Me } from './api'
import { timeAgo } from './time'
import { useNow } from './useNow'

interface Props {
    me: Me | null
}

export default function PhoneCard({ me }: Props) {
    const now = useNow()

    if (!me) return <section className="rounded-lg border border-gray-200 p-4">Loading…</section>

    return (
        <section className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 p-4">
            <div>
                <h2 className="text-lg font-semibold">{me.device_name ?? me.device_id}</h2>
                <p className="font-mono text-sm text-gray-600">
                    {me.device_id} · {me.platform}
                </p>
                <p className="text-sm text-gray-600">
                    {me.last_seen ? `Last seen ${timeAgo(me.last_seen, now)}` : 'Never seen yet'}
                </p>
            </div>

            <div className="flex items-center gap-3">
                {/* v2: OK / STAND UP badge goes here */}
                <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                        me.online ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                    }`}
                >
          {me.online ? 'Online' : 'Offline'}
        </span>
            </div>
        </section>
    )
}