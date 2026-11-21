import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { API_URL, buildPayload, isMockMode, sendEvent, type EventPayload } from './src/api';
import { getDeviceId } from './src/deviceId';
import { GuardScreen } from './src/GuardScreen';
import { useLocation, type LocationState } from './src/location';
import { getPin, savePin } from './src/pin';
import { PinPad } from './src/PinPad';
import { useAccelerometer } from './src/sensor';
import { colors } from './src/theme';
import { useGuard, type SessionSummary } from './src/useGuard';

type SendStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'retrying'; attempt: number; of: number }
  | { kind: 'sent'; id: number; stored: boolean }
  | { kind: 'failed'; reason: string };

/** Setting the PIN: enter it, then enter it again. `thenArm` when it was started by tapping Arm. */
type PinSetup = { step: 'enter' | 'confirm'; first?: string; mismatch?: boolean; thenArm: boolean };

export default function App() {
  const sensor = useAccelerometer();
  const gps = useLocation();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [pin, setPin] = useState<string | null>(null);
  const [pinSetup, setPinSetup] = useState<PinSetup | null>(null);
  const [stealth, setStealth] = useState(true);
  const [sendStatus, setSendStatus] = useState<SendStatus>({ kind: 'idle' });
  const [lastPayload, setLastPayload] = useState<EventPayload | null>(null);
  const [simulateError, setSimulateError] = useState(false);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
    getPin().then(setPin);
  }, []);

  const reading = sensor.status === 'ready' ? sensor.reading : null;
  const location = gps.status === 'ready' ? gps.point : null;
  const guard = useGuard(deviceId, reading, location, simulateError);
  const busy = sendStatus.kind === 'sending' || sendStatus.kind === 'retrying';
  const canSend = reading !== null && deviceId !== null && !busy;
  const canArm = reading !== null && deviceId !== null && guard.phase === 'disarmed';

  async function onSend() {
    if (!reading || !deviceId) return;
    const payload = buildPayload(deviceId, reading, location);
    setLastPayload(payload);
    setSendStatus({ kind: 'sending' });

    const result = await sendEvent(payload, {
      simulateError,
      onRetry: (attempt, of) => setSendStatus({ kind: 'retrying', attempt, of }),
    });
    setSendStatus(
      result.ok ? { kind: 'sent', id: result.data.id, stored: result.data.stored !== false } : { kind: 'failed', reason: result.reason },
    );
  }

  /** Arm needs a PIN, because the PIN is the only way to disarm. */
  function onArm() {
    if (pin) guard.arm();
    else setPinSetup({ step: 'enter', thenArm: true });
  }

  async function onPinEntered(entered: string) {
    if (!pinSetup) return;
    if (pinSetup.step === 'enter') {
      setPinSetup({ step: 'confirm', first: entered, thenArm: pinSetup.thenArm });
      return;
    }
    if (entered !== pinSetup.first) {
      setPinSetup({ step: 'enter', mismatch: true, thenArm: pinSetup.thenArm });
      return;
    }
    await savePin(entered);
    setPin(entered);
    setPinSetup(null);
    if (pinSetup.thenArm) guard.arm();
  }

  if (guard.phase !== 'disarmed' && pin) {
    return (
      <GuardScreen
        phase={guard.phase}
        armedAt={guard.armedAt}
        stats={guard.stats}
        magnitude={reading?.magnitude ?? null}
        location={location}
        settleSecondsLeft={guard.settleSecondsLeft}
        isStill={guard.isStill}
        alert={guard.alert}
        stealth={stealth}
        pin={pin}
        onCancel={guard.cancel}
        onDisarm={guard.disarm}
      />
    );
  }

  if (pinSetup) {
    return (
      <View style={[styles.screen, styles.pinScreen]}>
        <StatusBar style="light" />
        <Text style={styles.title}>{pinSetup.step === 'confirm' ? 'Enter it again' : 'Set a disarm PIN'}</Text>
        <Text style={[styles.small, styles.center]}>
          {pinSetup.mismatch
            ? "The PINs didn't match. Try again."
            : 'Four digits. While armed, this PIN is the only way to disarm. It stays on this phone.'}
        </Text>
        <PinPad color={colors.ink} pressedColor={colors.line} onComplete={onPinEntered} />
        <Pressable onPress={() => setPinSetup(null)} style={({ pressed }) => [styles.link, pressed && styles.buttonPressed]}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>StayPut</Text>

        <View style={[styles.badge, isMockMode ? styles.badgeMock : styles.badgeLive]}>
          <Text style={isMockMode ? styles.badgeMockText : styles.badgeLiveText}>{isMockMode ? 'MOCK MODE' : `LIVE: ${API_URL}`}</Text>
        </View>

        {guard.lastSession && <LastSession session={guard.lastSession} />}

        <Pressable
          onPress={onArm}
          disabled={!canArm}
          style={({ pressed }) => [styles.button, styles.armButton, !canArm && styles.buttonDisabled, pressed && styles.buttonPressed]}
        >
          <Text style={styles.armText}>Arm</Text>
        </Pressable>
        <Text style={styles.small}>
          Put it on your stuff and step back. It goes black once it lies still. Tap + PIN to disarm.
        </Text>
        {guard.error && <Text style={[styles.status, styles.statusFailed]}>{guard.error}</Text>}

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Stealth</Text>
            <Text style={styles.small}>Black screen while armed. Turn off to see GUARDING / MOVED while testing.</Text>
          </View>
          <Switch value={stealth} onValueChange={setStealth} trackColor={{ true: colors.accent, false: colors.line }} />
        </View>
        {pin && (
          <Pressable onPress={() => setPinSetup({ step: 'enter', thenArm: false })} style={({ pressed }) => [styles.link, pressed && styles.buttonPressed]}>
            <Text style={styles.linkText}>Change PIN</Text>
          </Pressable>
        )}

        <View style={styles.card}>
          <Text style={styles.label}>Accelerometer</Text>
          <Text style={styles.small}>{sensorLabel(sensor.status)}</Text>
          <View style={styles.axes}>
            <Axis name="x" value={reading?.x} />
            <Axis name="y" value={reading?.y} />
            <Axis name="z" value={reading?.z} />
          </View>
          <Text style={styles.magnitude}>{reading ? reading.magnitude.toFixed(3) : '-.---'} g</Text>
          <Text style={styles.small}>magnitude (≈ 1.000 when lying still)</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Location</Text>
          <Text style={styles.mono}>{location ? `${location.lat}, ${location.lon}` : '-'}</Text>
          <Text style={styles.small}>{locationLabel(gps)}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Device</Text>
          <Text style={styles.mono}>{deviceId ?? 'loading…'}</Text>
          <Text style={styles.small}>{Platform.OS}</Text>
        </View>

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={({ pressed }) => [styles.button, styles.secondaryButton, !canSend && styles.buttonDisabled, pressed && styles.buttonPressed]}
        >
          <Text style={styles.secondaryText}>{busy ? 'Sending…' : 'Send reading'}</Text>
        </Pressable>
        <Text style={[styles.status, sendStatus.kind === 'failed' && styles.statusFailed]}>{statusLabel(sendStatus)}</Text>

        {isMockMode && (
          <View style={styles.row}>
            <Text style={styles.small}>Simulate server error</Text>
            <Switch value={simulateError} onValueChange={setSimulateError} trackColor={{ true: colors.warn, false: colors.line }} />
          </View>
        )}

        {lastPayload && (
          <View style={styles.card}>
            <Text style={styles.label}>Last payload</Text>
            <Text style={styles.mono}>{JSON.stringify(lastPayload, null, 2)}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** After disarming: what happened while you were away. */
function LastSession({ session }: { session: SessionSummary }) {
  const since = new Date(session.armedAt).toLocaleTimeString();
  const { alert } = session;
  return (
    <View style={[styles.card, alert && styles.alertCard]}>
      <Text style={[styles.label, alert && styles.alertText]}>While you were away</Text>
      <Text style={[styles.sessionText, alert && styles.alertText]}>
        {alert
          ? `Picked up at ${new Date(alert.timestamp).toLocaleTimeString()} (${Math.round(alert.angle_deg)}°)`
          : `Nothing happened (armed at ${since})`}
      </Text>
    </View>
  );
}

function Axis({ name, value }: { name: string; value: number | undefined }) {
  return (
    <View style={styles.axis}>
      <Text style={styles.small}>{name}</Text>
      <Text style={styles.axisValue}>{value === undefined ? '-.---' : value.toFixed(3)}</Text>
    </View>
  );
}

function sensorLabel(status: 'checking' | 'unavailable' | 'ready'): string {
  switch (status) {
    case 'checking':
      return 'Checking availability…';
    case 'unavailable':
      return 'Not available on this device (use a real phone, not a simulator)';
    case 'ready':
      return 'Available ✓';
  }
}

function locationLabel(gps: LocationState): string {
  switch (gps.status) {
    case 'checking':
      return 'Asking for permission…';
    case 'denied':
      return 'Permission denied: arming works without location';
    case 'ready':
      if (!gps.point) return 'Waiting for a fix…';
      return `${gps.point.accuracy_m === null ? '' : `±${gps.point.accuracy_m} m. `}Sent with Arm, Send reading, and after an alert`;
  }
}

function statusLabel(status: SendStatus): string {
  switch (status.kind) {
    case 'idle':
      return 'Nothing sent yet';
    case 'sending':
      return 'Sending…';
    case 'retrying':
      return `Retrying (${status.attempt}/${status.of})…`;
    case 'sent':
      return status.stored ? `Sent ✓ id ${status.id}` : 'Sent ✓ (checked, not stored: the backend keeps only state changes)';
    case 'failed':
      return `Failed: ${status.reason}`;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  pinScreen: { alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  content: { padding: 20, paddingTop: 64, gap: 14 },
  center: { textAlign: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.5 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeMock: { backgroundColor: colors.warnSoft, borderColor: colors.warn },
  badgeLive: { backgroundColor: colors.okSoft, borderColor: colors.ok },
  badgeMockText: { fontSize: 12, fontWeight: '700', color: colors.warn },
  badgeLiveText: { fontSize: 12, fontWeight: '700', color: colors.ok },
  card: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 6 },
  // Like the dashboard's ALERT banner.
  alertCard: { backgroundColor: colors.alertSoft, borderColor: colors.alert },
  alertText: { color: colors.alert },
  sessionText: { fontSize: 17, fontWeight: '600', color: colors.ink },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, textTransform: 'uppercase' },
  small: { fontSize: 13, color: colors.muted },
  axes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  axis: { alignItems: 'center', flex: 1 },
  axisValue: { fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '600', color: colors.ink },
  magnitude: { fontSize: 44, fontWeight: '700', textAlign: 'center', marginTop: 8, fontVariant: ['tabular-nums'], color: colors.ink },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13, color: colors.ink },
  button: { borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  armButton: { backgroundColor: colors.accent },
  armText: { color: colors.onAccent, fontSize: 18, fontWeight: '700' },
  secondaryButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card },
  secondaryText: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.7 },
  link: { alignSelf: 'center', padding: 8 },
  linkText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  status: { fontSize: 16, textAlign: 'center', color: colors.ink },
  statusFailed: { color: colors.warn },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.ink },
});
