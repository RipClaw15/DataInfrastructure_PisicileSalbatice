export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787"
export const POLL_SECONDS = Number(import.meta.env.VITE_POLL_SECONDS) || 3
export const ACTIVE_POLL_SECONDS = 1
export const isFixtureMode = API_URL === ''
// Require pairing by default in live mode; opt-in via VITE_PAIRING=true in fixture mode.
export const PAIRING = import.meta.env.VITE_PAIRING === 'true' || (!isFixtureMode && import.meta.env.VITE_PAIRING !== 'false')
