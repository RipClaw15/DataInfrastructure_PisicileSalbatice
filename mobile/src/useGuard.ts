import { useEffect, useRef, useState } from 'react';

import { arm as armRequest, buildPayload, disarm as disarmRequest, getStatus, sendEvent, type Alert } from './api';
import { requestFix, type GeoPoint } from './location';
import { angleDeg, meanAxes, type Axes } from './motion';
import { utcNow, type Reading } from './sensor';

/**
 * While armed the phone sends only when something changes (the backend decides what to store):
 * - a reading as soon as it turns more than MOVE_SEND_DEG from the last one sent (at most one per second; after an alert too),
 * - a heartbeat every HEARTBEAT_MS, so the server can tell "lying still" from "gone silent",
 * - in ALERT, a fresh position every ALERT_FIX_INTERVAL_MS, each sent with a reading (and with every other reading).
 * Measured: on a table the direction wobbles 0.1-0.65 deg; picking the phone up turns it 25 deg or more.
 */
const MOVE_SEND_DEG = 2;
const MIN_SEND_GAP_MS = 1000;
const HEARTBEAT_MS = 30_000;
/** The phone also asks for the state right after sending a movement, so an alert shows up at once. */
const STATUS_POLL_INTERVAL_MS = 10_000;
/** In ALERT, how often to ask for the phone's position, so the dashboard map follows it. */
const ALERT_FIX_INTERVAL_MS = 5000;
/**
 * How long, from Start guarding, to wait for the position. It's kept for the whole session, so it's worth waiting
 * for a precise one; the countdown ends as soon as it's there (and the phone lies still), without one after this.
 */
const ARM_FIX_TIMEOUT_MS = 30_000;
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
export function useGuard(deviceId: string | null, reading: Reading | null, simulateError: boolean) {
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
  const simulateErrorRef = useRef(simulateError);
  simulateErrorRef.current = simulateError;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const alertRef = useRef(alert);
  alertRef.current = alert;
  const samplesRef = useRef<Sample[]>([]);
  const lastSentRef = useRef<Sent | null>(null);
  const sendingRef = useRef(false);
  /** The newest position asked for during this alert, sent with every reading. */
  const fixRef = useRef<GeoPoint | null>(null);
  /** The request for the position asked for at Start guarding (null once cancelled), and its answer once there. */
  const armFixRef = useRef<Promise<GeoPoint | null> | null>(null);
  const [armFix, setArmFix] = useState<{ point: GeoPoint | null } | null>(null);

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

    // Also waits for the position asked for at Start guarding (or its timeout); Cancel still works meanwhile.
    if (still && now - settleStartedAt >= SETTLE_MIN_MS && armFix) {
      void armWith(rest, armFix.point);
    }
  }, [phase, reading, settleStartedAt, armFix]);

  /** Sends the current reading, with the live location once in ALERT (the phone may be on the move). */
  async function sendReading(checkStatusAfter: boolean) {
    const current = readingRef.current;
    if (!deviceId || !current || sendingRef.current) return;
    sendingRef.current = true;
    const liveLocation = alertRef.current ? fixRef.current : null;
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
      // Keep the same object for the same alert, so the effects that depend on it don't restart on every check.
      const next = result.data.last_alert;
      setAlert((current) => (current?.id === next.id ? current : next));
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

  // In ALERT: ask for a fresh position right away and then every few seconds, and send each one.
  const inAlert = alert !== null;
  useEffect(() => {
    if (phase !== 'armed' || !inAlert) return;
    let cancelled = false;
    let asking = false;
    const ask = () => {
      if (asking) return;
      asking = true;
      void requestFix().then((point) => {
        asking = false;
        if (cancelled || !point) return;
        fixRef.current = point;
        void sendReading(false);
      });
    };
    ask();
    const timer = setInterval(ask, ALERT_FIX_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [phase, inAlert]);

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

  // On launch: if the server still has this phone guarding (the app was closed or the phone restarted), carry on
  // where it left off instead of going quiet, in ALERT too. The resting position stays the server's.
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    void getStatus(deviceId).then((result) => {
      if (cancelled || !result.ok || phaseRef.current !== 'disarmed' || result.data.state === 'DISARMED') return;
      lastSentRef.current = null;
      fixRef.current = null;
      setArmedAt(result.data.armed_at);
      setAlert(result.data.state === 'ALERT' ? result.data.last_alert : null);
      setPhase('armed');
    });
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  function arm() {
    if (!deviceId || !reading) return;
    samplesRef.current = [];
    setIsStill(false);
    setError(null);
    setLastSession(null);
    setSettleStartedAt(Date.now());
    // Asked for now, so it's usually there by the end of the countdown.
    setArmFix(null);
    const request = requestFix(ARM_FIX_TIMEOUT_MS);
    armFixRef.current = request;
    void request.then((point) => {
      if (armFixRef.current === request) setArmFix({ point });
    });
    setPhase('settling');
  }

  function cancel() {
    armFixRef.current = null;
    setArmFix(null);
    setSettleStartedAt(null);
    setPhase('disarmed');
  }

  async function armWith(rest: Axes, location: GeoPoint | null) {
    if (!deviceId) return;
    setPhase('arming');
    setSettleStartedAt(null);
    const restReading: Reading = { ...rest, magnitude: Math.round(Math.hypot(rest.x, rest.y, rest.z) * 1000) / 1000, takenAt: utcNow() };
    armFixRef.current = null;
    setArmFix(null);
    const result = await armRequest(deviceId, restReading, location, { simulateError: simulateErrorRef.current });
    if (result.ok) {
      lastSentRef.current = null;
      fixRef.current = null;
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
