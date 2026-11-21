import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Alert } from './api';
import type { AutoSendStats, GuardPhase } from './useGuard';

type Props = {
  phase: GuardPhase;
  armedAt: string | null;
  stats: AutoSendStats;
  magnitude: number | null;
  settleSecondsLeft: number;
  isStill: boolean;
  alert: Alert | null;
  onCancel: () => void;
  onDisarm: () => void;
};

/** Shown from tapping Arm until disarmed. Mounted only then, so the screen stays awake only while guarding. */
export function GuardScreen(props: Props) {
  useKeepAwake();
  return props.phase === 'settling' || props.phase === 'arming' ? <ArmingDelay {...props} /> : <Guarding {...props} />;
}

/** The arming delay: put the phone down and let it settle. */
function ArmingDelay({ phase, settleSecondsLeft, isStill, onCancel }: Props) {
  const message =
    phase === 'arming' ? 'Arming…' : settleSecondsLeft > 0 ? `Arming in ${settleSecondsLeft}` : isStill ? 'Arming…' : 'Hold still…';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Text style={[styles.title, styles.settling]}>PUT IT DOWN</Text>
        <Text style={styles.elapsed}>{message}</Text>
        <Text style={styles.hint}>Lay the phone on your stuff. It arms once it's been lying still for 2 seconds.</Text>
      </View>
      <Pressable
        onPress={onCancel}
        disabled={phase === 'arming'}
        style={({ pressed }) => [styles.button, styles.cancelButton, (pressed || phase === 'arming') && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

function Guarding({ phase, armedAt, stats, magnitude, alert, onDisarm }: Props) {
  const elapsed = useElapsed(armedAt);
  const disarming = phase === 'disarming';

  return (
    <View style={[styles.screen, alert && styles.alertScreen]}>
      <StatusBar style="light" />
      {alert ? (
        <View style={styles.center}>
          <Text style={[styles.title, styles.alertTitle]}>MOVED</Text>
          <Text style={styles.alertTime}>{new Date(alert.timestamp).toLocaleTimeString()}</Text>
          <Text style={styles.alertHint}>
            Picked up ({Math.round(alert.angle_deg)}° from where it lay). The alarm stays on until you disarm.
          </Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.title}>GUARDING</Text>
          <Text style={styles.elapsed}>{elapsed}</Text>
          <Text style={styles.hint}>Leave the phone where it is. Keep the app open.</Text>
        </View>
      )}

      <View style={styles.stats}>
        <Stat label="sent" value={String(stats.sent)} />
        <Stat label="failed" value={String(stats.failed)} warn={stats.failed > 0} />
        <Stat label="magnitude" value={magnitude === null ? '-.---' : `${magnitude.toFixed(3)} g`} />
      </View>
      {stats.lastError && <Text style={styles.error}>Last send failed: {stats.lastError}</Text>}

      <Pressable
        onPress={onDisarm}
        disabled={disarming}
        style={({ pressed }) => [styles.button, alert && styles.alertButton, (pressed || disarming) && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{disarming ? 'Disarming…' : 'Disarm'}</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warn && styles.warn]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** "mm:ss" (or "h:mm:ss") since armedAt, updated every second. */
function useElapsed(since: string | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!since) return '00:00';

  const total = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1220', padding: 24, paddingTop: 72, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: '#3ebd93', fontSize: 44, fontWeight: '800', letterSpacing: 4 },
  settling: { color: '#f0b429', fontSize: 36 },
  alertScreen: { backgroundColor: '#b42318' },
  alertTitle: { color: '#fff', fontSize: 56 },
  alertTime: { color: '#fff', fontSize: 40, fontWeight: '300', fontVariant: ['tabular-nums'] },
  alertHint: { color: '#fde2e1', fontSize: 15, textAlign: 'center' },
  alertButton: { backgroundColor: '#1f2933' },
  elapsed: { color: '#e4e7eb', fontSize: 56, fontWeight: '300', fontVariant: ['tabular-nums'] },
  hint: { color: '#9aa5b1', fontSize: 15, textAlign: 'center' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: '#e4e7eb', fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#7b8794', fontSize: 12, marginTop: 2 },
  warn: { color: '#f0b429' },
  error: { color: '#f0b429', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  button: { backgroundColor: '#d64545', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  cancelButton: { backgroundColor: '#3e4c59' },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
