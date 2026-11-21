import type { ReactNode } from 'react'
import { card, cardTitle, headline } from '../utils/ui.ts'

type KpiCardProps = {
    label: string
    hint: string
    icon: ReactNode
    value: ReactNode
    footer: ReactNode
}

export default function KpiCard({ label, hint, icon, value, footer }: KpiCardProps) {
    return (
        <section className={`flex flex-col gap-3 ${card}`}>
            <div className="flex items-center justify-between">
                <h2 className={cardTitle}>{label}</h2>
                <span className="grid size-7 place-items-center rounded-md bg-page text-muted">{icon}</span>
            </div>
            <div className={`text-3xl tabular-nums ${headline}`}>{value}</div>
            <div className="flex flex-col gap-2 text-xs text-muted tabular-nums">{footer}</div>
            <p className="mt-auto border-t border-line pt-3 text-xs text-muted">{hint}</p>
        </section>
    )
}
