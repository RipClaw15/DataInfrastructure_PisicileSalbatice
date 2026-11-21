import { useEffect, useState } from 'react';
import { Accelerometer } from 'expo-sensors';

export type Reading = {
  x: number;
  y: number;
  z: number;
  magnitude: number;
  /** UTC ISO 8601, e.g. 2026-11-20T18:45:00Z */
  takenAt: string;
};

export type SensorState =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'ready'; reading: Reading | null };

const UPDATE_INTERVAL_MS = 100;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Live accelerometer values in g (gravity included), about 10 per second. */
export function useAccelerometer(): SensorState {
  const [state, setState] = useState<SensorState>({ status: 'checking' });

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const available = await Accelerometer.isAvailableAsync();
      if (cancelled) return;
      if (!available) {
        setState({ status: 'unavailable' });
        return;
      }

      setState({ status: 'ready', reading: null });
      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);
      subscription = Accelerometer.addListener(({ x, y, z }) => {
        setState({
          status: 'ready',
          reading: {
            x: round3(x),
            y: round3(y),
            z: round3(z),
            magnitude: round3(Math.sqrt(x * x + y * y + z * z)),
            takenAt: utcNow(),
          },
        });
      });
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return state;
}
