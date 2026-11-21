
export const DASHBOARD_PATH = '/dashboard'

export const isDashboardPath = (pathname: string) => pathname.replace(/\/+$/, '').endsWith(DASHBOARD_PATH)
