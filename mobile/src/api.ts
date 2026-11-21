import { Platform } from 'react-native';

import {
  clearDeviceToken,
  getDeviceId,
  getDeviceName,
  getDeviceToken,
  regenerateDeviceId,
  saveDeviceName,
  saveDeviceToken,
} from './deviceId';
import type { GeoPoint } from './location';
import { utcNow, type Reading } from './sensor';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const isMockMode = API_URL === '';

const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

type Axes = { x: number; y: number; z: number };

/** Body of POST /api/me/events. */
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

/** Response of arm/disarm/status. */
export type DeviceStatus = {
  device_id: string;
  state: 'DISARMED' | 'GUARDING' | 'ALERT';
  armed_at: string | null;
  last_seen: string | null;
  online: boolean;
  last_alert: Alert | null;
};

export type PairingCodeResponse = {
  code: string;
  expires_at: string;
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

class RetryableError extends Error { }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cachedToken: string | null = null;
let registerInFlight: Promise<string> | null = null;

/**
 * Ensures this phone is registered with the backend and holds a device_token.
 * Silent, zero-login registration on first launch.
 */
export async function ensureRegistered(): Promise<ApiResult<{ deviceId: string; token: string }>> {
  const currentId = await getDeviceId();
  if (isMockMode) {
    return { ok: true, data: { deviceId: currentId, token: 'mock-device-token' } };
  }

  try {
    const token = await getOrRegisterToken();
    const finalId = await getDeviceId();
    return { ok: true, data: { deviceId: finalId, token } };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, reason };
  }
}

async function getOrRegisterToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const stored = await getDeviceToken();
  if (stored) {
    cachedToken = stored;
    return stored;
  }

  if (!registerInFlight) {
    registerInFlight = registerDevice().finally(() => {
      registerInFlight = null;
    });
  }
  return registerInFlight;
}

async function registerDevice(): Promise<string> {
  let deviceId = await getDeviceId();
  const defaultName = Platform.OS === 'ios' ? 'iPhone' : 'Android Phone';
  const deviceName = await getDeviceName(defaultName);

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id: deviceId,
          device_name: deviceName,
        }),
        signal: controller.signal,
      });
    } catch {
      throw new RetryableError(controller.signal.aborted ? 'timeout' : 'no connection to server');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 201) {
      const data = (await res.json()) as { device_token: string };
      await saveDeviceToken(data.device_token);
      cachedToken = data.device_token;
      return data.device_token;
    }

    if (res.status === 409 && attempt === 0) {
      // Server already has this ID from a previous install; allocate a fresh ID and retry once.
      deviceId = await regenerateDeviceId();
      continue;
    }

    if (res.status >= 500) throw new RetryableError(`server error ${res.status}`);
    throw new Error(`registration failed (${res.status})`);
  }

  throw new Error('registration failed');
}

async function postOnce<T>(path: string, body: unknown, okStatus: number): Promise<T> {
  const token = await getOrRegisterToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new RetryableError(controller.signal.aborted ? 'timeout' : 'no connection to server');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === okStatus) return (await res.json()) as T;
  if (res.status === 401) {
    // Token was invalidated (e.g. DB reset during dev); clear it so next attempt re-registers.
    cachedToken = null;
    await clearDeviceToken();
    throw new RetryableError('re-authenticating device');
  }
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

/** POST /api/me/events: one reading. */
export function sendEvent(payload: EventPayload, options: RequestOptions = {}): Promise<ApiResult<EventResponse>> {
  return post('/api/me/events', payload, 201, () => ({ id: ++mockId, device_id: payload.device_id, received_at: utcNow(), stored: true }), options);
}

/** POST /api/me/pairing-code: generate a single-use 6-digit dashboard pairing code. */
export function requestPairingCode(options: RequestOptions = {}): Promise<ApiResult<PairingCodeResponse>> {
  return post(
    '/api/me/pairing-code',
    undefined,
    201,
    () => ({
      code: '482913',
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    }),
    options,
  );
}

/**
 * POST /api/me/arm: starts guarding; the reading is the resting position.
 * `location` (optional) is where the phone was armed; left out without a GPS fix.
 */
export function arm(
  deviceId: string,
  reading: Reading,
  location: GeoPoint | null,
  options: RequestOptions = {},
): Promise<ApiResult<DeviceStatus>> {
  const body = { timestamp: reading.takenAt, axes: { x: reading.x, y: reading.y, z: reading.z }, ...(location && { location }) };
  return post('/api/me/arm', body, 200, () => mockStatus(deviceId, 'GUARDING', reading.takenAt), options);
}

/**
 * GET /api/me/status: one attempt, no retries (it's polled every second while armed).
 * Mock mode always answers GUARDING: alerts need a live server.
 */
export async function getStatus(deviceId: string): Promise<ApiResult<DeviceStatus>> {
  if (isMockMode) return { ok: true, data: mockStatus(deviceId, 'GUARDING', null) };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = await getOrRegisterToken();
    const res = await fetch(`${API_URL}/api/me/status`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (res.status === 401) {
      cachedToken = null;
      await clearDeviceToken();
      return { ok: false, reason: 're-authenticating device (401)' };
    }
    if (res.status !== 200) return { ok: false, reason: `status check failed (${res.status})` };
    return { ok: true, data: (await res.json()) as DeviceStatus };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'no connection to server' };
  } finally {
    clearTimeout(timer);
  }
}

/** POST /api/me/disarm: stops guarding. */
export function disarm(deviceId: string, options: RequestOptions = {}): Promise<ApiResult<DeviceStatus>> {
  return post('/api/me/disarm', undefined, 200, () => mockStatus(deviceId, 'DISARMED', null), options);
}

/** PATCH /api/me: rename this phone locally and on the backend. */
export async function updateDeviceName(name: string): Promise<ApiResult<{ device_name: string | null }>> {
  const trimmed = name.trim();
  await saveDeviceName(trimmed);
  if (isMockMode) {
    return { ok: true, data: { device_name: trimmed || null } };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const token = await getOrRegisterToken();
    const res = await fetch(`${API_URL}/api/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ device_name: trimmed || null }),
      signal: controller.signal,
    });
    if (res.status === 200) {
      const data = (await res.json()) as { device_name: string | null };
      return { ok: true, data };
    }
    if (res.status === 401) {
      cachedToken = null;
      await clearDeviceToken();
      return { ok: false, reason: 're-authenticating device (401)' };
    }
    return { ok: false, reason: `could not save name (${res.status})` };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'timeout' : 'no connection to server' };
  } finally {
    clearTimeout(timer);
  }
}

function mockStatus(deviceId: string, state: DeviceStatus['state'], armedAt: string | null): DeviceStatus {
  return { device_id: deviceId, state, armed_at: armedAt, last_seen: utcNow(), online: true, last_alert: null };
}
