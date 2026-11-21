import { useEffect, useRef, useState } from 'react';

import { arm as armRequest, buildPayload, disarm as disarmRequest, getStatus, sendEvent, type Alert } from './api';
import type { GeoPoint } from './location';
import { angleDeg, meanAxes, type Axes } from './motion';
import { utcNow, type Reading } from './sensor';

/**
 * While armed the phone sends only when something changes (the backend decides what to store):
 * - a reading as soon as it turns more than MOVE_SEND_DEG from the last one sent (at most one per second; after an alert too),
 * - a heartbeat every HEARTBEAT_MS, so the server can tell "lying still" from "gone silent",
 * - in ALERT, the live location with every reading, and a reading whenever the location changes (every 10 m).
 * Measured: on a table the direction wobbles 0.1-0.65 deg; picking the phone up turns it 25 deg or more.
 */
const MOVE_SEND_DEG = 2;
const MIN_SEND_GAP_MS = 1000;
const HEARTBEAT_MS = 30_000;
/** The phone also asks for the state right after sending a movement, so an alert shows up at once. */
const STATUS_POLL_INTERVAL_MS = 10_000;
/** Arming delay: time to put the phone down after tapping Arm. */
const SETTLE_MIN_MS = 5000;
/**
 * The phone must have been this still, for this long, before its position is taken as the resting position.
 * Measured: on a table the direction wobbles 0.1-0.65 deg within 2 s; held still in a hand, ~1 deg.
 */
const STILL_WINDOW_MS = 2000;
const STILL_MAX_DEG = 0.8;

export type GuardPhase = 'disarmed' | 'settling' | 'arming' | 'armed' | 'disarming';

export type AutoSendStats = {
  sent: number;
  failed: number;
  lastId: number | null;
  lastError: string | null;
};

export type SessionSummary = { armedAt: string; alert: Alert | null };

const EMPTY_STATS: AutoSendStats = { sent: 0, failed: 0, lastId: null, lastError: null };

type Sample = { at: number; axes: Axes };
type Sent = { at: number; axes: Axes; location: GeoPoint | null };

/**
 * Arm/disarm the phone (contract v1) and, while armed, send readings by the rules above.
 *
 * Arming waits until the phone has been put down and lies still, then uses the average of
 * the still readings as the resting position. Otherwise a phone armed in the hand would
 * raise "picked up" the moment it's put on the table.
 *
 * Sends don't retry: the next movement or heartbeat follows anyway.
 */
export function useGuard(deviceId: string | null, reading: Reading | null, location: GeoPoint | null, simulateError: boolean) {
  const [phase, setPhase] = useState<GuardPhase>('disarmed');
  const [armedAt, setArmedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AutoSendStats>(EMPTY_STATS);
  const [settleStartedAt, setSettleStartedAt] = useState<number | null>(null);
  const [isStill, setIsStill] = useState(false);
  /** Set when the server reports ALERT for this session (the server decides what counts as moved). */
  const [alert, setAlert] = useState<Alert | null>(null);
  const [lastSession, setLastSession] = useState<SessionSummary | null>(null);

  // The effects below read the newest values through refs instead of restarting every 100 ms.
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const locationRef = useRef(location);
  locationRef.current = location;
  const simulateErrorRef = useRef(simulateError);
  simulateErrorRef.current = simulateError;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const alertRef = useRef(alert);
  alertRef.current = alert;
  const samplesRef = useRef<Sample[]>([]);
  const lastSentRef = useRef<Sent | null>(null);
  const sendingRef = useRef(false);

  // Settling: collect readings until the phone has been still long enough, then arm.
  useEffect(() => {
    if (phase !== 'settling' || !reading || settleStartedAt === null) return;
    const now = Date.now();
    const samples = [...samplesRef.current, { at: now, axes: { x: reading.x, y: reading.y, z: reading.z } }].filter(
      (s) => now - s.at <= STILL_WINDOW_MS,
    );
    samplesRef.current = samples;

    const rest = meanAxes(samples.map((s) => s.axes));
    const coversWindow = samples.length > 1 && now - samples[0].at >= STILL_WINDOW_MS * 0.9;
    const still = coversWindow && samples.every((s) => angleDeg(s.axes, rest) <= STILL_MAX_DEG);
    setIsStill(still);

    if (still && now - settleStartedAt >= SETTLE_MIN_MS) {
      void armWith(rest);
    }
  }, [phase, reading, settleStartedAt]);

  /** Sends the current reading, with the live location once in ALERT (the phone may be on the move). */
  async function sendReading(checkStatusAfter: boolean) {
    const current = readingRef.current;
    if (!deviceId || !current || sendingRef.current) return;
    sendingRef.current = true;
    const liveLocation = alertRef.current ? locationRef.current : null;
    lastSentRef.current = { at: Date.now(), axes: { x: current.x, y: current.y, z: current.z }, location: liveLocation };
    const result = await sendEvent(buildPayload(deviceId, current, liveLocation), {
      retry: false,
      simulateError: simulateErrorRef.current,
    });
    sendingRef.current = false;
    setStats((s) =>
      result.ok
        ? { ...s, sent: s.sent + 1, lastId: result.data.id, lastError: null }
        : { ...s, failed: s.failed + 1, lastError: result.reason },
    );
    if (checkStatusAfter) await checkStatus();
  }

  async function checkStatus() {
    if (!deviceId) return;
    const result = await getStatus(deviceId);
    if (phaseRef.current !== 'armed') return;
    if (result.ok && result.data.state === 'ALERT' && result.data.last_alert) {
      setAlert(result.data.last_alert);
    }
  }

  // Armed: send as soon as the phone turns away from the last reading sent. This goes on after an alert too, so the
  // dashboard's 3D phone follows it; the backend doesn't store these. Before an alert, check the state right after.
  useEffect(() => {
    const last = lastSentRef.current;
    if (phase !== 'armed' || !reading || !last) return;
    if (Date.now() - last.at >= MIN_SEND_GAP_MS && angleDeg(reading, last.axes) > MOVE_SEND_DEG) {
      void sendReading(!alert);
    }
  }, [phase, alert, reading]);

  // In ALERT: send whenever the location changes (right away for the first one).
  useEffect(() => {
    if (phase !== 'armed' || !alert || !location) return;
    const last = lastSentRef.current?.location;
    if (last && last.lat === location.lat && last.lon === location.lon) return;
    void sendReading(false);
  }, [phase, alert, location]);

  // Armed: a first reading right away, then heartbeats and a status check now and then.
  useEffect(() => {
    if (phase !== 'armed' || !deviceId) return;
    void sendReading(false);
    const heartbeat = setInterval(() => {
      const last = lastSentRef.current;
      if (!last || Date.now() - last.at >= HEARTBEAT_MS) void sendReading(false);
    }, 1000);
    const poll = setInterval(() => void checkStatus(), STATUS_POLL_INTERVAL_MS);
    return () => {
      clearInterval(heartbeat);
      clearInterval(poll);
    };
  }, [phase, deviceId]);

  function arm() {
    if (!deviceId || !reading) return;
    samplesRef.current = [];
    setIsStill(false);
    setError(null);
    setLastSession(null);
    setSettleStartedAt(Date.now());
    setPhase('settling');
  }

  function cancel() {
    setSettleStartedAt(null);
    setPhase('disarmed');
  }

  async function armWith(rest: Axes) {
    if (!deviceId) return;
    setPhase('arming');
    setSettleStartedAt(null);
    const restReading: Reading = { ...rest, magnitude: Math.round(Math.hypot(rest.x, rest.y, rest.z) * 1000) / 1000, takenAt: utcNow() };
    const result = await armRequest(deviceId, restReading, locationRef.current, { simulateError: simulateErrorRef.current });
    if (result.ok) {
      lastSentRef.current = null;
      setArmedAt(result.data.armed_at ?? restReading.takenAt);
      setStats(EMPTY_STATS);
      setAlert(null);
      setPhase('armed');
    } else {
      setPhase('disarmed');
      setError(
        `Couldn't start guarding: ${result.reason}.\n` +
          'Check that the server in EXPO_PUBLIC_API_URL is running, or start the dummy server from the repo root:\n' +
          'python mobile/dev-server/server.py',
      );
    }
  }

  async function disarm() {
    if (!deviceId) return;
    setPhase('disarming');
    const result = await disarmRequest(deviceId, { simulateError });
    // Stop guarding on the phone either way; the owner wants it off.
    setLastSession(armedAt ? { armedAt, alert } : null);
    setPhase('disarmed');
    setArmedAt(null);
    setAlert(null);
    setError(result.ok ? null : `Stopped on the phone, but the server didn't confirm: ${result.reason}`);
  }

  const settleSecondsLeft =
    settleStartedAt === null ? 0 : Math.max(0, Math.ceil((SETTLE_MIN_MS - (Date.now() - settleStartedAt)) / 1000));

  /** After Delete my data: what happened in the last session isn't there to show any more. */
  const forgetLastSession = () => setLastSession(null);

  return { phase, armedAt, error, stats, isStill, settleSecondsLeft, alert, lastSession, arm, cancel, disarm, forgetLastSession };
}
