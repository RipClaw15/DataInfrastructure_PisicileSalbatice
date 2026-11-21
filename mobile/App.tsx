import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { API_URL, buildPayload, isMockMode, sendEvent, type EventPayload } from './src/api';
import { getDeviceId } from './src/deviceId';
import { GuardScreen } from './src/GuardScreen';
import { useLocation, type LocationState } from './src/location';
import { useAccelerometer } from './src/sensor';
import { useGuard } from './src/useGuard';

type SendStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'retrying'; attempt: number; of: number }
  | { kind: 'sent'; id: number }
  | { kind: 'failed'; reason: string };

export default function App() {
  const sensor = useAccelerometer();
  const gps = useLocation();
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState<SendStatus>({ kind: 'idle' });
  const [lastPayload, setLastPayload] = useState<EventPayload | null>(null);
  const [simulateError, setSimulateError] = useState(false);

  useEffect(() => {
    getDeviceId().then(setDeviceId);
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
    setSendStatus(result.ok ? { kind: 'sent', id: result.data.id } : { kind: 'failed', reason: result.reason });
  }

  if (guard.phase !== 'disarmed') {
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
        onCancel={guard.cancel}
        onDisarm={guard.disarm}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Sensor check</Text>

        <View style={[styles.badge, isMockMode ? styles.badgeMock : styles.badgeLive]}>
          <Text style={styles.badgeText}>{isMockMode ? 'MOCK MODE' : `LIVE: ${API_URL}`}</Text>
        </View>

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
          onPress={guard.arm}
          disabled={!canArm}
          style={({ pressed }) => [styles.button, styles.armButton, !canArm && styles.buttonDisabled, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Arm</Text>
        </Pressable>
        <Text style={styles.small}>Tap Arm, then put the phone down on your stuff. It arms once it lies still, then sends a reading every second.</Text>
        {guard.error && <Text style={[styles.status, styles.statusFailed]}>{guard.error}</Text>}

        <Pressable
          onPress={onSend}
          disabled={!canSend}
          style={({ pressed }) => [styles.button, !canSend && styles.buttonDisabled, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>{busy ? 'Sending…' : 'Send reading'}</Text>
        </Pressable>

        <Text style={[styles.status, sendStatus.kind === 'failed' && styles.statusFailed]}>
          {statusLabel(sendStatus)}
        </Text>

        {isMockMode && (
          <View style={styles.row}>
            <Text style={styles.small}>Simulate server error</Text>
            <Switch value={simulateError} onValueChange={setSimulateError} />
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
      return `${gps.point.accuracy_m === null ? '' : `±${gps.point.accuracy_m} m. `}Sent with Arm, Send reading, and every reading after an alert`;
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
      return `Sent ✓ id ${status.id}`;
    case 'failed':
      return `Failed: ${status.reason}`;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7' },
  content: { padding: 20, paddingTop: 64, gap: 14 },
  title: { fontSize: 28, fontWeight: '700' },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeMock: { backgroundColor: '#f0b429' },
  badgeLive: { backgroundColor: '#3ebd93' },
  badgeText: { fontSize: 12, fontWeight: '700', color: '#1f2933' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: '#52606d', textTransform: 'uppercase' },
  small: { fontSize: 13, color: '#7b8794' },
  axes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  axis: { alignItems: 'center', flex: 1 },
  axisValue: { fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '600' },
  magnitude: { fontSize: 44, fontWeight: '700', textAlign: 'center', marginTop: 8, fontVariant: ['tabular-nums'] },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 13 },
  button: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  armButton: { backgroundColor: '#1f2933' },
  buttonDisabled: { backgroundColor: '#9aa5b1' },
  buttonPressed: { opacity: 0.8 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  status: { fontSize: 16, textAlign: 'center' },
  statusFailed: { color: '#d64545' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
