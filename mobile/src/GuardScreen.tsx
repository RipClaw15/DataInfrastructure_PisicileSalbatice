import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Alert } from './api';
import type { GeoPoint } from './location';
import { PinPad } from './PinPad';
import { colors, fonts, stealth } from './theme';
import type { AutoSendStats, GuardPhase } from './useGuard';

/** The PIN pad hides again after this long without a key press. */
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
  /** Stealth: a black screen that looks dead, the same before and after an alert. Off: the GUARDING / MOVED screens (development). */
  stealth: boolean;
  pin: string;
  onCancel: () => void;
  /** Called after the right PIN: the only way to disarm. */
  onDisarm: () => void;
};

/** Shown from tapping Arm until disarmed. Mounted only then, so the screen stays awake only while guarding. */
export function GuardScreen(props: Props) {
  useKeepAwake();
  if (props.phase === 'settling' || props.phase === 'arming') return <ArmingDelay {...props} />;
  return props.stealth ? <Stealth {...props} /> : <Guarding {...props} />;
}

function ArmingDelay({ phase, settleSecondsLeft, isStill, stealth: isStealth, onCancel }: Props) {
  const message =
    phase === 'arming' ? 'Starting…' : settleSecondsLeft > 0 ? `Starting in ${settleSecondsLeft}` : isStill ? 'Starting…' : 'Hold still…';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Text style={[styles.title, styles.settling]}>PUT IT DOWN</Text>
        <Text style={styles.big}>{message}</Text>
        {isStealth && <Text style={styles.hint}>Tap + PIN to stop</Text>}
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

/**
 * Pitch black at minimum brightness from the moment it arms: on AMOLED the pixels are off, so the phone looks dead.
 * Nothing shows whether it's guarding or has raised an alert. A tap shows only the PIN pad.
 */
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

/** Development screen (stealth off): shows the state; Disarm still needs the PIN. */
function Guarding({ phase, armedAt, stats, magnitude, location, alert, pin, onDisarm }: Props) {
  const elapsed = useElapsed(armedAt);
  const [askPin, setAskPin] = useState(false);
  const disarming = phase === 'disarming';

  return (
    <View style={[styles.screen, alert && styles.alertScreen]}>
      <StatusBar style="light" />
      {askPin ? (
        <View style={styles.center}>
          <Text style={styles.hint}>Enter your PIN to stop guarding</Text>
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
        <Text style={styles.secondaryText}>{disarming ? 'Stopping…' : askPin ? 'Back' : 'Stop guarding'}</Text>
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

/** Dims the screen while mounted and puts the previous brightness back afterwards (iOS keeps it otherwise). */
function useMinimumBrightness() {
  useEffect(() => {
    let previous: number | null = null;
    let cancelled = false;
    (async () => {
      try {
        previous = await Brightness.getBrightnessAsync();
        if (!cancelled) await Brightness.setBrightnessAsync(0);
      } catch {
        // Not available: the black screen alone still looks dead on AMOLED.
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
  title: { fontFamily: fonts.bold, color: colors.ok, fontSize: 44, letterSpacing: 2 },
  settling: { color: colors.accent, fontSize: 36 },
  big: { fontFamily: fonts.regular, color: colors.ink, fontSize: 56, fontVariant: ['tabular-nums'] },
  hint: { fontFamily: fonts.regular, color: colors.muted, fontSize: 16, textAlign: 'center' },
  alertScreen: { backgroundColor: colors.alertSoft },
  alertTitle: { color: colors.alert, fontSize: 56 },
  alertText: { color: colors.alert },
  alertLocation: { fontFamily: fonts.bold, color: colors.ink, fontSize: 17, textAlign: 'center', fontVariant: ['tabular-nums'] },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 20, fontVariant: ['tabular-nums'] },
  statLabel: { fontFamily: fonts.regular, color: colors.muted, fontSize: 13, marginTop: 2 },
  warn: { color: colors.warn },
  error: { fontFamily: fonts.regular, color: colors.warn, fontSize: 14, textAlign: 'center', marginBottom: 12 },
  button: { borderRadius: 12, paddingVertical: 18, alignItems: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: colors.line },
  secondaryText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 18 },
  buttonPressed: { opacity: 0.6 },
});
