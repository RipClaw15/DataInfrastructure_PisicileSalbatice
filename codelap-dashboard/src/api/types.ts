export interface Me {
    device_id: string
    device_name: string | null
    platform: string
    created_at: string
    last_seen: string | null
    online: boolean
}

export interface Reading {
    id: number
    device_id: string
    event_type: string
    value: number
    unit: string
    timestamp: string
    axes: { x: number; y: number; z: number }
    received_at: string
    /** Why the backend kept this reading; the 'armed' one holds the resting position. */
    snapshot_reason?: 'armed' | 'picked_up' | 'gps_update' | 'disarmed'
}

export interface EventsResponse {
    events: Reading[]
}

export type GuardState = 'DISARMED' | 'GUARDING' | 'ALERT'

export interface Alert {
    id: number
    device_id: string
    type: string
    timestamp: string
    angle_deg: number
    value: number
    unit: string
    axes: { x: number; y: number; z: number }
}

export interface Location {
    lat: number
    lon: number
    accuracy_m: number | null
}

export interface DeviceStatus {
    device_id: string
    state: GuardState
    armed_at: string | null
    last_alert: Alert | null
    online: boolean
    last_seen: string | null
    location?: Location | null
    last_location?: Location | null
}

export interface AlertsResponse {
    device_id: string
    alerts: Alert[]
}

// Pairing (v3)
export interface MyEventsResponse {
    device_id: string
    events: Omit<Reading, 'device_id'>[]
}

export interface PairResponse {
    device_id: string
    viewer_token: string
}
