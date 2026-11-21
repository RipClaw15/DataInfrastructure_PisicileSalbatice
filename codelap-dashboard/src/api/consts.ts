export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const POLL_SECONDS = Number(import.meta.env.VITE_POLL_SECONDS) || 3
export const ACTIVE_POLL_SECONDS = 1
export const PAIRING = import.meta.env.VITE_PAIRING === 'true'
export const isFixtureMode = API_URL === ''
