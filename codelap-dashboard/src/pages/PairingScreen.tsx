import { useRef, useState } from 'react'
import { pair } from '../api'

type PairingScreenProps = {
    onPaired: () => void
}

export default function PairingScreen({ onPaired }: PairingScreenProps) {
    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    async function submit(value: string) {
        setLoading(true)
        setError(null)
        try {
            await pair(value)
            onPaired()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong')
            setCode('')
            inputRef.current?.focus()
        } finally {
            setLoading(false)
        }
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        const value = e.target.value.replace(/\D/g, '').slice(0, 6)
        setCode(value)
        if (value.length === 6) submit(value)
    }

    return (
        <main className="flex min-h-screen items-center justify-center p-6">
            <div className="flex w-full max-w-sm flex-col gap-6 text-center">
                <h1 className="text-3xl font-semibold">Pair your phone</h1>
                <p className="text-gray-600">
                    Open the app on your phone, tap <em>Show dashboard code</em>, and enter it here.
                </p>

                <input
                    ref={inputRef}
                    value={code}
                    onChange={handleChange}
                    readOnly={loading}
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    aria-label="6-digit pairing code"
                    className="w-full rounded-lg border border-gray-300 py-4 text-center font-mono text-4xl tracking-[0.5em] focus:border-black focus:outline-none"
                />

                <p role="alert" className="h-5 text-sm text-red-600">
                    {loading ? 'Pairing…' : error}
                </p>
            </div>
        </main>
    )
}