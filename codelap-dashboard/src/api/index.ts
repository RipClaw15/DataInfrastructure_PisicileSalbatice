import meFixture from '../fixtures/me.json'
import myEventsFixture from '../fixtures/me_events.json'
import pairFixture from '../fixtures/pair_response.json'
import eventsFixture from '../../../contracts/frontend/events.json'
import alertsFixture from '../../../contracts/frontend/alerts.json'
import statusAlert from '../../../contracts/frontend/status_alert.json'
import statusGuarding from '../../../contracts/frontend/status_guarding.json'
import statusDisarmed from '../../../contracts/frontend/status_disarmed.json'
import {API_URL, isFixtureMode} from "./consts.ts";
import type {
    AlertsResponse,
    DeviceStatus,
    EventsResponse,
    Me,
    MyEventsResponse,
    PairResponse,
    Reading,
} from "./types.ts";

const TOKEN_KEY = 'viewer_token'
const REQUEST_TIMEOUT_MS = 5000
const FIXTURE_CODE = '482913'

export class UnauthorizedError extends Error {
    constructor() {
        super('Unauthorized')
    }
}

export class NetworkError extends Error {
    constructor() {
        super('Backend unreachable')
    }
}

export class ApiError extends Error {
    status: number
    retryAfterSeconds?: number
    constructor(status: number, message: string, retryAfterSeconds?: number) {
        super(message)
        this.status = status
        this.retryAfterSeconds = retryAfterSeconds
    }
}

// Clear any legacy localStorage token so opening /dashboard in a new session starts on the pairing screen.
localStorage.removeItem(TOKEN_KEY)

export const hasToken = () => sessionStorage.getItem(TOKEN_KEY) !== null
export const clearToken = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body) headers.set('Content-Type', 'application/json')
    if (auth) {
        const token = sessionStorage.getItem(TOKEN_KEY)
        if (token) headers.set('Authorization', `Bearer ${token}`)
    }

    
    const signal = init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    try {
        const res = await fetch(`${API_URL.replace(/\/+$/, '')}${path}`, { ...init, headers, signal })
        if (res.status === 401 && auth) {
            clearToken()
            throw new UnauthorizedError()
        }
        if (!res.ok) {
            const body = await res.json().catch((error: unknown) => {
                if (signal.aborted) throw error
                return null
            })
            const retryHeader = res.headers.get('Retry-After')
            const parsedRetry = retryHeader ? Number.parseInt(retryHeader, 10) : Number.NaN
            const retryAfterSeconds = Number.isFinite(parsedRetry) && parsedRetry > 0
                ? parsedRetry
                : res.status === 429
                    ? 60
                    : undefined
            throw new ApiError(res.status, body?.detail ?? `Request failed (${res.status})`, retryAfterSeconds)
        }
        return await res.json() as T
    } catch (error) {
        if (error instanceof UnauthorizedError || error instanceof ApiError) throw error
        throw new NetworkError()
    }
}

// The sample readings end at 19:05:14Z but the sample session runs 19:10:00-19:10:30Z, so the
// armed band and alert marker would fall off the chart. In fixture mode, shift the readings
// so the newest one lands on the sample status' last_seen.
const fixtureOffsetMs =
    new Date(statusAlert.last_seen).getTime() - new Date(eventsFixture.events[0].timestamp).getTime()
const shiftIso = (iso: string) => new Date(new Date(iso).getTime() + fixtureOffsetMs).toISOString()

export async function getEvents(limit = 50): Promise<EventsResponse> {
    if (isFixtureMode) {
        const events = eventsFixture.events.slice(0, limit)
        return {
            events: events.map((e) => ({
                ...e,
                timestamp: shiftIso(e.timestamp),
                received_at: shiftIso(e.received_at),
            })),
        }
    }
    return request<EventsResponse>(`/api/me/events?limit=${limit}`)
}

const statusFixtures = { alert: statusAlert, guarding: statusGuarding, disarmed: statusDisarmed }


function fixtureStatus(): DeviceStatus {
    const key = new URLSearchParams(window.location.search).get('state') ?? 'alert'
    const fixture = statusFixtures[key as keyof typeof statusFixtures] ?? statusAlert
    const status = { ...fixture } as DeviceStatus
    if (status.state === 'ALERT') {
        status.last_location = { lat: 46.7712, lon: 23.6236, accuracy_m: 15 }
    }
    return status
}

export async function getStatus(): Promise<DeviceStatus> {
    if (isFixtureMode) return fixtureStatus()
    return request<DeviceStatus>('/api/me/status')
}

/** The latest reading the backend got from the phone (in memory, not history), or null. */
export async function getLive(): Promise<Reading | null> {
    if (isFixtureMode) {
        
        
        const status = fixtureStatus()
        const armedAt = status.armed_at ? new Date(status.armed_at).getTime() : 0
        const distance = (e: Reading) => Math.abs(new Date(shiftIso(e.timestamp)).getTime() - armedAt)
        const reading =
            status.state === 'ALERT'
                ? eventsFixture.events[0]
                : eventsFixture.events.reduce((best, e) => (distance(e) < distance(best) ? e : best))
        return { ...reading, timestamp: shiftIso(reading.timestamp), received_at: shiftIso(reading.received_at) }
    }
    return request<Reading | null>('/api/me/live')
}

export async function getAlerts(limit = 20): Promise<AlertsResponse> {
    if (isFixtureMode) return { ...alertsFixture, alerts: alertsFixture.alerts.slice(0, limit) }
    return request<AlertsResponse>(`/api/me/alerts?limit=${limit}`)
}



function requireFixtureToken() {
    if (!hasToken()) throw new UnauthorizedError()
}

export async function pair(code: string): Promise<PairResponse> {
    let data: PairResponse

    if (isFixtureMode) {
        if (code !== FIXTURE_CODE) throw new ApiError(400, 'Invalid or expired code')
        data = pairFixture
    } else {
        data = await request<PairResponse>(
            '/api/pair',
            { method: 'POST', body: JSON.stringify({ code }) },
            false,
        )
    }

    sessionStorage.setItem(TOKEN_KEY, data.viewer_token)
    return data
}

export async function getMe(): Promise<Me> {
    if (isFixtureMode) {
        requireFixtureToken()
        return meFixture
    }
    return request<Me>('/api/me')
}

export async function getMyEvents(limit = 50): Promise<MyEventsResponse> {
    if (isFixtureMode) {
        requireFixtureToken()
        return { ...myEventsFixture, events: myEventsFixture.events.slice(0, limit) }
    }
    return request<MyEventsResponse>(`/api/me/events?limit=${limit}`)
}
