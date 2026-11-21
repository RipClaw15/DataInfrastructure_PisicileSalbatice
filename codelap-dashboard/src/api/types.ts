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
    event_type: string
    value: number
    unit: string
    timestamp: string
    axes: { x: number; y: number; z: number }
    received_at: string
}

export interface EventsResponse {
    device_id: string
    events: Reading[]
}

export interface PairResponse {
    device_id: string
    viewer_token: string
}