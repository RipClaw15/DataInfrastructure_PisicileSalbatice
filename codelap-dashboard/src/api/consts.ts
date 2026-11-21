export const API_URL: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
export const POLL_SECONDS = Number(import.meta.env.VITE_POLL_SECONDS) || 3
export const isFixtureMode = API_URL === ''