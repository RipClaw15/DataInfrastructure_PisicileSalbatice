import type { GeoPoint } from './location';
import { utcNow, type Reading } from './sensor';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const isMockMode = API_URL === '';

const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

type Axes = { x: number; y: number; z: number };

export type EventPayload = {
  device_id: string;
  event_type: 'accelerometer';
  value: number;
  unit: 'g';
  timestamp: string;
  axes: Axes;
  location?: GeoPoint;
};

export type EventResponse = {
  id: number;
  device_id: string;
  received_at: string;
  stored?: boolean;
};

export type Alert = {
  id: number;
  type: string;
  timestamp: string;
  angle_deg: number;
};

export type DeviceStatus = {
  device_id: string;
  state: 'DISARMED' | 'GUARDING' | 'ALERT';
  armed_at: string | null;
  last_seen: string | null;
  online: boolean;
  last_alert: Alert | null;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; reason: string };

type RequestOptions = {
  simulateError?: boolean;
  retry?: boolean;
  onRetry?: (attempt: number, of: number) => void;
};

export function buildPayload(deviceId: string, reading: Reading, location: GeoPoint | null = null): EventPayload {
  return {
    device_id: deviceId,
    event_type: 'accelerometer',
    value: reading.magnitude,
    unit: 'g',
    timestamp: reading.takenAt,
    axes: { x: reading.x, y: reading.y, z: reading.z },
    ...(location && { location }),
  };
}

class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function postOnce<T>(path: string, body: unknown, okStatus: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new RetryableError(controller.signal.aborted ? 'timeout' : 'no connection to server');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === okStatus) return (await res.json()) as T;
  if (res.status >= 500) throw new RetryableError(`server error ${res.status}`);
  if (res.status === 422) throw new Error('invalid data (422)');
  if (res.status === 404) throw new Error('not found (404): is the server up to date?');
  throw new Error(`unexpected response ${res.status}`);
}

async function post<T>(path: string, body: unknown, okStatus: number, mock: () => T, options: RequestOptions): Promise<ApiResult<T>> {
  const maxRetries = options.retry === false ? 0 : RETRY_DELAYS_MS.length;
  for (let attempt = 0; ; attempt++) {
    try {
      if (isMockMode) {
        await sleep(300);
        if (options.simulateError) throw new RetryableError('server error 500 (simulated)');
        return { ok: true, data: mock() };
      }
      return { ok: true, data: await postOnce<T>(path, body, okStatus) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!(error instanceof RetryableError) || attempt >= maxRetries) {
        return { ok: false, reason };
      }
      options.onRetry?.(attempt + 1, maxRetries);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

let mockId = 1000;

export function sendEvent(payload: EventPayload, options: RequestOptions = {}): Promise<ApiResult<EventResponse>> {
  return post('/api/events', payload, 201, () => ({ id: ++mockId, device_id: payload.device_id, received_at: utcNow(), stored: true }), options);
}

export function arm(
  deviceId: string,
  reading: Reading,
  location: GeoPoint | null,
  options: RequestOptions = {},
): Promise<ApiResult<DeviceStatus>> {
  const body = { timestamp: reading.takenAt, axes: { x: reading.x, y: reading.y, z: reading.z }, ...(location && { location }) };
  return post(`/api/devices/${deviceId}/arm`, body, 200, () => mockStatus(deviceId, 'GUARDING', reading.takenAt), options);
}

export async function getStatus(deviceId: string): Promise<ApiResult<DeviceStatus>> {
  if (isMockMode) return { ok: true, data: mockStatus(deviceId, 'GUARDING', null) };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/api/devices/${deviceId}/status`, { signal: controller.signal });
    if (res.status !== 200) return { ok: false, reason: `status check failed (${res.status})` };
    return { ok: true, data: (await res.json()) as DeviceStatus };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'no connection to server' };
  } finally {
    clearTimeout(timer);
  }
}

export function disarm(deviceId: string, options: RequestOptions = {}): Promise<ApiResult<DeviceStatus>> {
  return post(`/api/devices/${deviceId}/disarm`, undefined, 200, () => mockStatus(deviceId, 'DISARMED', null), options);
}

function mockStatus(deviceId: string, state: DeviceStatus['state'], armedAt: string | null): DeviceStatus {
  return { device_id: deviceId, state, armed_at: armedAt, last_seen: utcNow(), online: true, last_alert: null };
}
