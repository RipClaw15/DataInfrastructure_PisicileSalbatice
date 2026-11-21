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
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

export const hasToken = () => localStorage.getItem(TOKEN_KEY) !== null
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request<T>(path: string, init: RequestInit = {}, auth = true): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body) headers.set('Content-Type', 'application/json')
    if (auth) {
        const token = localStorage.getItem(TOKEN_KEY)
        if (token) headers.set('Authorization', `Bearer ${token}`)
    }

    // Keep the timeout active through body parsing, not just response headers.
    const signal = init.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    try {
        const res = await fetch(`${API_URL}${path}`, { ...init, headers, signal })
        if (res.status === 401 && auth) {
            clearToken()
            throw new UnauthorizedError()
        }
        if (!res.ok) {
            const body = await res.json().catch((error: unknown) => {
                if (signal.aborted) throw error
                return null
            })
            throw new ApiError(res.status, body?.detail ?? `Request failed (${res.status})`)
        }
        return await res.json() as T
    } catch (error) {
        if (error instanceof UnauthorizedError || error instanceof ApiError) throw error
        throw new NetworkError()
    }
}

// v0 + v1: no token, pairing is off until v3

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
    return request<EventsResponse>(`/api/events?limit=${limit}`, {}, false)
}

const statusFixtures = { alert: statusAlert, guarding: statusGuarding, disarmed: statusDisarmed }

// Fixture mode: pick the state with ?state=alert|guarding|disarmed (default: alert)
function fixtureStatus(): DeviceStatus {
    const key = new URLSearchParams(window.location.search).get('state') ?? 'alert'
    const fixture = statusFixtures[key as keyof typeof statusFixtures] ?? statusAlert
    const status = { ...fixture } as DeviceStatus
    if (status.state === 'ALERT') {
        status.last_location = { lat: 46.7712, lon: 23.6236, accuracy_m: 15 }
    }
    return status
}

export async function getStatus(deviceId: string): Promise<DeviceStatus> {
    if (isFixtureMode) return fixtureStatus()
    return request<DeviceStatus>(`/api/devices/${encodeURIComponent(deviceId)}/status`, {}, false)
}

/** The latest reading the backend got from the phone (in memory, not history), or null. */
export async function getLive(deviceId: string): Promise<Reading | null> {
    if (isFixtureMode) {
        // Alert: the newest sample reading (the phone picked up). Otherwise: the one closest to when it was
        // armed, so a guarding phone lies where it was put.
        const status = fixtureStatus()
        const armedAt = status.armed_at ? new Date(status.armed_at).getTime() : 0
        const distance = (e: Reading) => Math.abs(new Date(shiftIso(e.timestamp)).getTime() - armedAt)
        const reading =
            status.state === 'ALERT'
                ? eventsFixture.events[0]
                : eventsFixture.events.reduce((best, e) => (distance(e) < distance(best) ? e : best))
        return { ...reading, timestamp: shiftIso(reading.timestamp), received_at: shiftIso(reading.received_at) }
    }
    return request<Reading | null>(`/api/devices/${encodeURIComponent(deviceId)}/live`, {}, false)
}

export async function getAlerts(deviceId: string, limit = 20): Promise<AlertsResponse> {
    if (isFixtureMode) return { ...alertsFixture, alerts: alertsFixture.alerts.slice(0, limit) }
    return request<AlertsResponse>(
        `/api/devices/${encodeURIComponent(deviceId)}/alerts?limit=${limit}`,
        {},
        false,
    )
}

// Pairing (v3, VITE_PAIRING=true)

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

    localStorage.setItem(TOKEN_KEY, data.viewer_token)
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
