import { useState } from 'react'
import type { GuardState } from '../../api/types.ts'

const PREVIEWS: Record<GuardState, { button: string; title: string; description: string }> = {
    DISARMED: { button: 'Disarmed', title: 'Disarmed', description: "The phone isn't guarding." },
    GUARDING: { button: 'Guarding', title: 'Guarding', description: 'The phone is lying still and watching your stuff.' },
    ALERT: { button: 'Alert', title: 'Picked up', description: 'Someone moved it. The alarm stays on until you disarm it.' },
}

const STATES = Object.keys(PREVIEWS) as GuardState[]

/** Presentation only: switches sample states, no API calls or real device controls. */
export default function StatusPreview() {
    const [mode, setMode] = useState<GuardState>('GUARDING')
    const preview = PREVIEWS[mode]

    return (
        <section id="preview" className="sp-section sp-preview-section" aria-labelledby="preview-title">
            <div className="sp-preview-copy">
                <p className="sp-eyebrow">A glimpse of the experience</p>
                <h2 id="preview-title">
                    One phone.
                    <br />
                    Three clear states.
                </h2>
                <p>Choose a state to see how it looks.</p>
            </div>
            <div className="sp-preview-card">
                <div className="sp-preview-top">
                    <span>Guard status</span>
                </div>
                <div className="sp-preview-status" data-mode={mode} role="status" aria-live="polite" aria-atomic="true">
                    <span className="sp-status-symbol" aria-hidden="true">◈</span>
                    <h3>{preview.title}</h3>
                    <p>{preview.description}</p>
                </div>
                <div className="sp-state-buttons" role="group" aria-label="Preview a guard state">
                    {STATES.map((state) => (
                        <button key={state} type="button" onClick={() => setMode(state)} aria-pressed={mode === state}>
                            {PREVIEWS[state].button}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    )
}
