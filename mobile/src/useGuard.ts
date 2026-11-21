import { useEffect, useRef, useState } from 'react';

import { arm as armRequest, buildPayload, disarm as disarmRequest, getStatus, sendEvent, type Alert } from './api';
import type { GeoPoint } from './location';
import { angleDeg, meanAxes, type Axes } from './motion';
import { utcNow, type Reading } from './sensor';

const AUTO_SEND_INTERVAL_MS = 1000;
const STATUS_POLL_INTERVAL_MS = 1000;
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

const EMPTY_STATS: AutoSendStats = { sent: 0, failed: 0, lastId: null, lastError: null };

type Sample = { at: number; axes: Axes };

/**
 * Arm/disarm the phone (contract v1) and, while armed, send the current reading every second.
 *
 * Arming waits until the phone has been put down and lies still, then uses the average of
 * the still readings as the resting position. Otherwise a phone armed in the hand would
 * raise "picked up" the moment it's put on the table.
 *
 * Auto-send doesn't retry: a failed reading is simply replaced by the next one.
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

  // The intervals and effects below read the newest values through refs instead of restarting every 100 ms.
  const readingRef = useRef(reading);
  readingRef.current = reading;
  const locationRef = useRef(location);
  locationRef.current = location;
  const simulateErrorRef = useRef(simulateError);
  simulateErrorRef.current = simulateError;
  const samplesRef = useRef<Sample[]>([]);

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

  const alertRef = useRef(alert);
  alertRef.current = alert;

  // Armed: send the current reading every second; once in ALERT, with the live location (the phone may be on the move).
  useEffect(() => {
    if (phase !== 'armed' || !deviceId) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      const current = readingRef.current;
      if (inFlight || !current) return;
      inFlight = true;
      const location = alertRef.current ? locationRef.current : null;
      const result = await sendEvent(buildPayload(deviceId, current, location), { retry: false, simulateError: simulateErrorRef.current });
      inFlight = false;
      setStats((s) =>
        result.ok
          ? { ...s, sent: s.sent + 1, lastId: result.data.id, lastError: null }
          : { ...s, failed: s.failed + 1, lastError: result.reason },
      );
    }, AUTO_SEND_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phase, deviceId]);

  // Armed: ask the server every second whether it has raised an alert.
  useEffect(() => {
    if (phase !== 'armed' || !deviceId) return;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (inFlight) return;
      inFlight = true;
      const result = await getStatus(deviceId);
      inFlight = false;
      if (result.ok && result.data.state === 'ALERT' && result.data.last_alert) {
        setAlert(result.data.last_alert);
      }
    }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [phase, deviceId]);

  /** Tap on Arm: start the arming delay. */
  function arm() {
    if (!deviceId || !reading) return;
    samplesRef.current = [];
    setIsStill(false);
    setError(null);
    setSettleStartedAt(Date.now());
    setPhase('settling');
  }

  /** Cancel during the arming delay. */
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
      setArmedAt(result.data.armed_at ?? restReading.takenAt);
      setStats(EMPTY_STATS);
      setAlert(null);
      setPhase('armed');
    } else {
      setPhase('disarmed');
      setError(
        `Could not arm: ${result.reason}.\n` +
          'Arm needs the dummy server running (the backend has no arm yet). From the repo root:\n' +
          'python mobile/dev-server/server.py\n' +
          'If it was already running, restart it so it has the arm endpoints.',
      );
    }
  }

  async function disarm() {
    if (!deviceId) return;
    setPhase('disarming');
    const result = await disarmRequest(deviceId, { simulateError });
    // Stop guarding on the phone either way; the user wants it off.
    setPhase('disarmed');
    setArmedAt(null);
    setAlert(null);
    setError(result.ok ? null : `Stopped on the phone, but the server didn't confirm: ${result.reason}`);
  }

  const settleSecondsLeft =
    settleStartedAt === null ? 0 : Math.max(0, Math.ceil((SETTLE_MIN_MS - (Date.now() - settleStartedAt)) / 1000));

  return { phase, armedAt, error, stats, isStill, settleSecondsLeft, alert, arm, cancel, disarm };
}
