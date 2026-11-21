import { useEffect, useRef, useState } from 'react'
import { ApiError, pair } from '../api'

type PairingScreenProps = {
    onPaired: () => void
}

const LOCK_STORAGE_KEY = 'pair_locked_until'

function readInitialSecondsLeft(): number {
    const raw = sessionStorage.getItem(LOCK_STORAGE_KEY)
    if (!raw) return 0
    const remaining = Math.ceil((Number(raw) - Date.now()) / 1000)
    if (remaining > 0) return remaining
    sessionStorage.removeItem(LOCK_STORAGE_KEY)
    return 0
}

function formatCountdown(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = String(seconds % 60).padStart(2, '0')
    return `${mins}:${secs}`
}

export default function PairingScreen({ onPaired }: PairingScreenProps) {
    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [secondsLeft, setSecondsLeft] = useState(readInitialSecondsLeft)
    const inputRef = useRef<HTMLInputElement>(null)

    const locked = secondsLeft > 0

    useEffect(() => {
        if (!locked) {
            sessionStorage.removeItem(LOCK_STORAGE_KEY)
            return
        }
        const timer = window.setInterval(() => {
            const raw = sessionStorage.getItem(LOCK_STORAGE_KEY)
            const next = raw ? Math.ceil((Number(raw) - Date.now()) / 1000) : 0
            if (next <= 0) {
                sessionStorage.removeItem(LOCK_STORAGE_KEY)
                setSecondsLeft(0)
                setError(null)
                window.setTimeout(() => inputRef.current?.focus(), 0)
            } else {
                setSecondsLeft(next)
            }
        }, 1000)
        return () => window.clearInterval(timer)
    }, [locked])

    async function submit(value: string) {
        if (locked) return
        setLoading(true)
        setError(null)
        try {
            await pair(value)
            sessionStorage.removeItem(LOCK_STORAGE_KEY)
            onPaired()
        } catch (e) {
            if (e instanceof ApiError && e.status === 429) {
                const waitSeconds = e.retryAfterSeconds ?? 60
                sessionStorage.setItem(LOCK_STORAGE_KEY, String(Date.now() + waitSeconds * 1000))
                setSecondsLeft(waitSeconds)
                setError(null)
            } else {
                setError(e instanceof Error ? e.message : 'Something went wrong')
                inputRef.current?.focus()
            }
            setCode('')
        } finally {
            setLoading(false)
        }
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        if (locked || loading) return
        const value = e.target.value.replace(/\D/g, '').slice(0, 6)
        setCode(value)
        if (value.length === 6) submit(value)
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-page p-6 text-ink">
            <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-line bg-card p-8 text-center">
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-semibold tracking-tight">Pair your phone</h1>
                    <p className="text-sm text-muted">
                        Open the app on your phone, tap <em className="not-italic font-medium text-ink">Show dashboard code</em>, and enter it here.
                    </p>
                </div>

                <input
                    ref={inputRef}
                    value={code}
                    onChange={handleChange}
                    disabled={locked}
                    readOnly={loading}
                    autoFocus={!locked}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder={locked ? 'LOCKED' : '000000'}
                    aria-label="6-digit pairing code"
                    className={`w-full rounded-xl border py-4 text-center font-mono transition-colors focus:outline-none ${
                        locked
                            ? 'cursor-not-allowed border-warn/40 bg-warn-soft/50 text-2xl tracking-[0.2em] text-muted'
                            : 'border-line bg-page text-4xl tracking-[0.45em] text-ink focus:border-accent'
                    }`}
                />

                {locked ? (
                    <div
                        role="alert"
                        className="flex flex-col items-center gap-1 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-warn"
                    >
                        <p className="text-sm font-medium">Too many attempts</p>
                        <p className="font-mono text-2xl font-semibold tabular-nums">
                            {formatCountdown(secondsLeft)}
                        </p>
                        <p className="text-xs opacity-80">Input will unlock automatically</p>
                    </div>
                ) : (
                    <p role="alert" className="min-h-5 text-sm text-warn">
                        {loading ? 'Pairing…' : error}
                    </p>
                )}
            </div>
        </main>
    )
}
