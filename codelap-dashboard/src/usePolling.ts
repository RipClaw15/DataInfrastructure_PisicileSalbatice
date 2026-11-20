import { useEffect, useRef, useState } from 'react'
import { UnauthorizedError } from './api'

export function usePolling<T>(
    fetcher: () => Promise<T>,
    seconds: number,
    onUnauthorized: () => void,
) {
    const [data, setData] = useState<T | null>(null)
    const [error, setError] = useState<Error | null>(null)
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

    const fetcherRef = useRef(fetcher)
    const onUnauthorizedRef = useRef(onUnauthorized)

    useEffect(() => {
        fetcherRef.current = fetcher
        onUnauthorizedRef.current = onUnauthorized
    })

    useEffect(() => {
        let cancelled = false
        let timer: number | undefined

        async function tick() {
            try {
                const result = await fetcherRef.current()
                if (cancelled) return
                setData(result)
                setError(null)
                setLastRefreshed(new Date())
            } catch (e) {
                if (cancelled) return
                if (e instanceof UnauthorizedError) {
                    onUnauthorizedRef.current()
                    return
                }
                setError(e instanceof Error ? e : new Error('Unknown error'))
            }
            timer = window.setTimeout(tick, seconds * 1000)
        }

        tick()
        return () => {
            cancelled = true
            window.clearTimeout(timer)
        }
    }, [seconds])

    return { data, error, lastRefreshed }
}