export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787"
export const POLL_SECONDS = Number(import.meta.env.VITE_POLL_SECONDS) || 3
export const ACTIVE_POLL_SECONDS = 1
export const isFixtureMode = API_URL === ''
// Always show the 6-digit pairing screen first unless explicitly disabled via VITE_PAIRING=false.
export const PAIRING = import.meta.env.VITE_PAIRING !== 'false'
