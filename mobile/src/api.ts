import { utcNow, type Reading } from './sensor';

/** Empty → mock mode (no network calls). Read at bundle time; restart Expo after changing .env. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');
export const isMockMode = API_URL === '';

const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Body of POST /api/events (contracts/mobile/post_event_request.json). */
export type EventPayload = {
  device_id: string;
  event_type: 'accelerometer';
  value: number;
  unit: 'g';
  timestamp: string;
  axes: { x: number; y: number; z: number };
};

/** 201 response (contracts/mobile/post_event_response.json). */
export type EventResponse = {
  id: number;
  device_id: string;
  received_at: string;
};

export type SendResult =
  | { ok: true; response: EventResponse }
  | { ok: false; reason: string };

export function buildPayload(deviceId: string, reading: Reading): EventPayload {
  return {
    device_id: deviceId,
    event_type: 'accelerometer',
    value: reading.magnitude,
    unit: 'g',
    timestamp: reading.takenAt,
    axes: { x: reading.x, y: reading.y, z: reading.z },
  };
}

/** Thrown for failures worth retrying (5xx, timeout, no network). */
class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let mockId = 1000;

async function postOnce(payload: EventPayload, simulateError: boolean): Promise<EventResponse> {
  if (isMockMode) {
    await sleep(300);
    if (simulateError) throw new RetryableError('server error 500 (simulated)');
    return { id: ++mockId, device_id: payload.device_id, received_at: utcNow() };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    throw new RetryableError(controller.signal.aborted ? 'timeout' : 'no connection to server');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 201) return (await res.json()) as EventResponse;
  if (res.status >= 500) throw new RetryableError(`server error ${res.status}`);
  if (res.status === 422) throw new Error('invalid data (422)');
  throw new Error(`unexpected response ${res.status}`);
}

/**
 * Sends one reading. Retries 5xx/network failures up to 3 times (1 s, 2 s, 4 s);
 * anything else (e.g. 422) fails immediately.
 */
export async function sendEvent(
  payload: EventPayload,
  options: { simulateError?: boolean; onRetry?: (attempt: number, of: number) => void } = {},
): Promise<SendResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true, response: await postOnce(payload, options.simulateError ?? false) };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      if (!(error instanceof RetryableError) || attempt >= RETRY_DELAYS_MS.length) {
        return { ok: false, reason };
      }
      options.onRetry?.(attempt + 1, RETRY_DELAYS_MS.length);
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}
