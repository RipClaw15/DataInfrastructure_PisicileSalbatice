import { useEffect, useRef, useState } from 'react'
import { UnauthorizedError } from '../api'


type Seconds<T> = number | ((data: T | null) => number)

export function usePolling<T>(
    fetcher: () => Promise<T>,
    seconds: Seconds<T>,
    onUnauthorized?: () => void,
    enabled = true,
) {
    const [data, setData] = useState<T | null>(null)
    const [error, setError] = useState<Error | null>(null)
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

    const fetcherRef = useRef(fetcher)
    const secondsRef = useRef(seconds)
    const onUnauthorizedRef = useRef(onUnauthorized)

    useEffect(() => {
        fetcherRef.current = fetcher
        secondsRef.current = seconds
        onUnauthorizedRef.current = onUnauthorized
    })

    
    const fixedSeconds = typeof seconds === 'number' ? seconds : null

    useEffect(() => {
        if (!enabled) return

        let cancelled = false
        let timer: number | undefined

        const delayFor = (result: T | null) => {
            const s = secondsRef.current
            return (typeof s === 'function' ? s(result) : s) * 1000
        }

        let result: T | null = null
        async function tick() {
            try {
                result = await fetcherRef.current()
                if (cancelled) return
                setData(result)
                setError(null)
                setLastRefreshed(new Date())
            } catch (e) {
                if (cancelled) return
                if (e instanceof UnauthorizedError) {
                    onUnauthorizedRef.current?.()
                    return
                }
                setError(e instanceof Error ? e : new Error('Unknown error'))
            }
            timer = window.setTimeout(tick, delayFor(result))
        }

        tick()
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [fixedSeconds, enabled])

    return { data, error, lastRefreshed }
}
