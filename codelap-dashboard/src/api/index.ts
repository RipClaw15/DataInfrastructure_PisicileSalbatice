import meFixture from '../fixtures/me.json'
import eventsFixture from '../fixtures/me_events.json'
import pairFixture from '../fixtures/pair_response.json'
import {API_URL, isFixtureMode} from "./consts.ts";
import type {EventsResponse, Me, PairResponse} from "./types.ts";

const TOKEN_KEY = 'viewer_token'
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
    headers.set('Content-Type', 'application/json')
    if (auth) {
        const token = localStorage.getItem(TOKEN_KEY)
        if (token) headers.set('Authorization', `Bearer ${token}`)
    }

    let res: Response
    try {
        res = await fetch(`${API_URL}${path}`, { ...init, headers })
    } catch {
        throw new NetworkError()
    }

    if (res.status === 401 && auth) {
        clearToken()
        throw new UnauthorizedError()
    }
    if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new ApiError(res.status, body?.detail ?? `Request failed (${res.status})`)
    }
    return res.json() as Promise<T>
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

export async function getMyEvents(limit = 50): Promise<EventsResponse> {
    if (isFixtureMode) {
        requireFixtureToken()
        return { ...eventsFixture, events: eventsFixture.events.slice(0, limit) }
    }
    return request<EventsResponse>(`/api/me/events?limit=${limit}`)
}
