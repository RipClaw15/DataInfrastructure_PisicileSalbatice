import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

/** Where the phone is (the optional `location` of POST /api/devices/{id}/arm). */
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

/** Live GPS position while the app is open. Asks for permission once; arming works without it if denied. */
export function useLocation(): LocationState {
  const [state, setState] = useState<LocationState>({ status: 'checking' });

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!granted) {
        setState({ status: 'denied' });
        return;
      }

      setState({ status: 'ready', point: null });
      const watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 1 }, ({ coords }) => {
        setState({
          status: 'ready',
          point: {
            lat: round6(coords.latitude),
            lon: round6(coords.longitude),
            accuracy_m: coords.accuracy === null ? null : Math.round(coords.accuracy),
          },
        });
      });
      if (cancelled) watch.remove();
      else subscription = watch;
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  return state;
}
