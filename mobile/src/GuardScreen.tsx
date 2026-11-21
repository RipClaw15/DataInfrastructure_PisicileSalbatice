import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Alert } from './api';
import type { GeoPoint } from './location';
import { PinPad } from './PinPad';
import { colors, stealth } from './theme';
import type { AutoSendStats, GuardPhase } from './useGuard';


const PAD_MS = 10_000;

type Props = {
  phase: GuardPhase;
  armedAt: string | null;
  stats: AutoSendStats;
  magnitude: number | null;
  location: GeoPoint | null;
  settleSecondsLeft: number;
  isStill: boolean;
  alert: Alert | null;
  
  stealth: boolean;
  pin: string;
  onCancel: () => void;
  
  onDisarm: () => void;
};


export function GuardScreen(props: Props) {
  useKeepAwake();
  if (props.phase === 'settling' || props.phase === 'arming') return <ArmingDelay {...props} />;
  return props.stealth ? <Stealth {...props} /> : <Guarding {...props} />;
}


function ArmingDelay({ phase, settleSecondsLeft, isStill, stealth: isStealth, onCancel }: Props) {
  const message =
    phase === 'arming' ? 'Arming…' : settleSecondsLeft > 0 ? `Arming in ${settleSecondsLeft}` : isStill ? 'Arming…' : 'Hold still…';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Text style={[styles.title, styles.settling]}>PUT IT DOWN</Text>
        <Text style={styles.big}>{message}</Text>
        {isStealth && <Text style={styles.hint}>Tap + PIN to disarm</Text>}
      </View>
      <Pressable
        onPress={onCancel}
        disabled={phase === 'arming'}
        style={({ pressed }) => [styles.button, styles.secondaryButton, (pressed || phase === 'arming') && styles.buttonPressed]}
      >
        <Text style={styles.secondaryText}>Cancel</Text>
      </Pressable>
    </View>
  );
}


function Stealth({ pin, onDisarm }: Props) {
  const [padUntil, setPadUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  useMinimumBrightness();

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const showPad = now < padUntil;
  const keepPadOpen = () => {
    setPadUntil(Date.now() + PAD_MS);
    setNow(Date.now());
  };

  return (
    <Pressable style={styles.stealth} onPress={keepPadOpen}>
      <StatusBar hidden />
      {showPad && <PinPad color={stealth.pin} onKey={keepPadOpen} onComplete={(entered) => entered === pin && onDisarm()} />}
    </Pressable>
  );
}


function Guarding({ phase, armedAt, stats, magnitude, location, alert, pin, onDisarm }: Props) {
  const elapsed = useElapsed(armedAt);
  const [askPin, setAskPin] = useState(false);
  const disarming = phase === 'disarming';

  return (
    <View style={[styles.screen, alert && styles.alertScreen]}>
      <StatusBar style="light" />
      {askPin ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Enter your PIN to disarm</Text>
          <PinPad color={colors.ink} pressedColor={colors.card} onComplete={(entered) => entered === pin && onDisarm()} />
        </View>
      ) : alert ? (
        <View style={styles.center}>
          <Text style={[styles.title, styles.alertTitle]}>MOVED</Text>
          <Text style={[styles.big, styles.alertText]}>{new Date(alert.timestamp).toLocaleTimeString()}</Text>
          <Text style={[styles.hint, styles.alertText]}>
            Picked up ({Math.round(alert.angle_deg)}° from where it lay). The alarm stays on until you disarm.
          </Text>
          <Text style={styles.alertLocation}>{location ? `Now at ${formatLocation(location)}` : 'No GPS fix'}</Text>
        </View>
      ) : (
        <View style={styles.center}>
          <Text style={styles.title}>GUARDING</Text>
          <Text style={styles.big}>{elapsed}</Text>
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
        onPress={() => setAskPin((v) => !v)}
        disabled={disarming}
        style={({ pressed }) => [styles.button, styles.secondaryButton, (pressed || disarming) && styles.buttonPressed]}
      >
        <Text style={styles.secondaryText}>{disarming ? 'Disarming…' : askPin ? 'Back' : 'Disarm'}</Text>
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

function formatLocation({ lat, lon, accuracy_m }: GeoPoint): string {
  return accuracy_m === null ? `${lat}, ${lon}` : `${lat}, ${lon} (±${accuracy_m} m)`;
}


function useMinimumBrightness() {
  useEffect(() => {
    let previous: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        previous = await Brightness.getBrightnessAsync();
        if (!cancelled) await Brightness.setBrightnessAsync(0);
      } catch {
        
      }
    })();
    return () => {
      cancelled = true;
      if (previous !== null) Brightness.setBrightnessAsync(previous).catch(() => {});
    };
  }, []);
}


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
  screen: { flex: 1, backgroundColor: colors.page, padding: 24, paddingTop: 72, paddingBottom: 48 },
  stealth: { flex: 1, backgroundColor: stealth.black, alignItems: 'center', justifyContent: 'center', gap: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  title: { color: colors.ok, fontSize: 44, fontWeight: '800', letterSpacing: 4 },
  settling: { color: colors.accent, fontSize: 36 },
  big: { color: colors.ink, fontSize: 56, fontWeight: '300', fontVariant: ['tabular-nums'] },
  hint: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  
  alertScreen: { backgroundColor: colors.alertSoft },
  alertTitle: { color: colors.alert, fontSize: 56 },
  alertText: { color: colors.alert },
  alertLocation: { color: colors.ink, fontSize: 17, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: colors.ink, fontSize: 20, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  warn: { color: colors.warn },
  error: { color: colors.warn, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  button: { borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: colors.line },
  secondaryText: { color: colors.ink, fontSize: 18, fontWeight: '600' },
  buttonPressed: { opacity: 0.6 },
});
