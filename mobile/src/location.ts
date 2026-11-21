import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type GeoPoint = {
  lat: number;
  lon: number;
  /** Radius in meters the phone is likely within; indoors often 10-50. */
  accuracy_m: number | null;
};

export type LocationState =
  | { status: 'checking' }
  | { status: 'denied' }
  | { status: 'ready'; point: GeoPoint | null };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** A fix older than this isn't where the phone is now (the phone may hand back a cached one from somewhere else). */
const MAX_FIX_AGE_MS = 60_000;
/** Indoors a fix can take a while; after this, give up on this request (callers can wait longer, see useGuard). */
const FIX_TIMEOUT_MS = 15_000;

let lastFix: GeoPoint | null = null;
const listeners = new Set<(point: GeoPoint) => void>();

/**
 * Asks the phone for its position now. The location is only needed when guarding starts and during an alert,
 * so it's asked for then, not watched all the time. null without permission, a fresh fix, or within the timeout.
 * High accuracy (~10 m): indoors it can take a while.
 */
export async function requestFix(timeoutMs = FIX_TIMEOUT_MS): Promise<GeoPoint | null> {
  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!result || Date.now() - result.timestamp > MAX_FIX_AGE_MS) return null;
    const point = {
      lat: round6(result.coords.latitude),
      lon: round6(result.coords.longitude),
      accuracy_m: result.coords.accuracy === null ? null : Math.round(result.coords.accuracy),
    };
    lastFix = point;
    listeners.forEach((listener) => listener(point));
    return point;
  } catch {
    return null;
  }
}

/** Location permission (asked once; guarding works without it) and the last position asked for, for display. */
export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    const onFix = (point: GeoPoint) => {
      if (!cancelled) setState({ status: 'ready', point });
    };
    listeners.add(onFix);

    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!granted) {
        setState({ status: 'denied' });
        return;
      }
      setState({ status: 'ready', point: lastFix });
      void requestFix();
    })();

    return () => {
      cancelled = true;
      listeners.delete(onFix);
    };
  }, []);

  return state;
}
