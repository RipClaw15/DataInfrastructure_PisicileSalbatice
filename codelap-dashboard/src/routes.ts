/** The landing page is at `/`, the live dashboard at `/dashboard` (also where the backend serves this build). */
export const DASHBOARD_PATH = '/dashboard'

export const isDashboardPath = (pathname: string) => pathname.replace(/\/+$/, '').endsWith(DASHBOARD_PATH)
