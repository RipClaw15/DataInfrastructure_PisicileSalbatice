import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  SchibstedGrotesk_400Regular,
  SchibstedGrotesk_500Medium,
  SchibstedGrotesk_600SemiBold,
  SchibstedGrotesk_700Bold,
  useFonts,
} from '@expo-google-fonts/schibsted-grotesk';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  API_URL,
  buildPayload,
  deleteMyData,
  ensureRegistered,
  getDashboardPairing,
  isMockMode,
  requestPairingCode,
  sendEvent,
  updateDeviceName,
  type EventPayload,
  type DashboardPairing,
  type PairingCodeResponse,
} from './src/api';
import { getDeviceId, getDeviceName } from './src/deviceId';
import { GuardScreen } from './src/GuardScreen';
import { useLocation, type LocationState } from './src/location';
import { getPin, savePin } from './src/pin';
import { PinPad } from './src/PinPad';
import { useAccelerometer } from './src/sensor';
import { colors, fonts } from './src/theme';
import { useGuard, type SessionSummary } from './src/useGuard';

type SendStatus =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'retrying'; attempt: number; of: number }
  | { kind: 'sent'; id: number; stored: boolean }
  | { kind: 'failed'; reason: string };

/** Setting the PIN: enter it, then enter it again. `thenArm` when it was started by tapping Arm. */
type PinSetup = { step: 'enter' | 'confirm'; first?: string; mismatch?: boolean; thenArm: boolean };

type PairingState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: PairingCodeResponse; before: DashboardPairing | null }
  | { kind: 'expired' }
  | { kind: 'failed'; reason: string };

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SchibstedGrotesk_400Regular,
    SchibstedGrotesk_500Medium,
    SchibstedGrotesk_600SemiBold,
    SchibstedGrotesk_700Bold,
  });
  const sensor = useAccelerometer();
  const gps = useLocation();
  const defaultName = Platform.OS === 'ios' ? 'iPhone' : 'Android Phone';
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState(defaultName);
  const [draftName, setDraftName] = useState(defaultName);
  const [editingName, setEditingName] = useState(false);
  const [nameStatus, setNameStatus] = useState<'idle' | 'saving' | 'saved' | string>('idle');
  const [pin, setPin] = useState<string | null>(null);
  const [pinSetup, setPinSetup] = useState<PinSetup | null>(null);
  const [stealth, setStealth] = useState(true);
  const [sendStatus, setSendStatus] = useState<SendStatus>({ kind: 'idle' });
  const [pairing, setPairing] = useState<PairingState>({ kind: 'idle' });
  const [lastPayload, setLastPayload] = useState<EventPayload | null>(null);
  const [simulateError, setSimulateError] = useState(false);
  const [deleting, setDeleting] = useState<'idle' | 'deleting' | 'deleted' | string>('idle');
  const [connection, setConnection] = useState<'checking' | 'ok' | 'offline'>('checking');
  const [showDeveloper, setShowDeveloper] = useState(false);
  /** This phone's dashboard (one at most); null until known. Arming needs one. */
  const [dashboard, setDashboard] = useState<DashboardPairing | null>(isMockMode ? { paired: true, pairedAt: null } : null);

  useEffect(() => {
    let active = true;
    getDeviceId().then((id) => {
      if (active) setDeviceId(id);
    });
    getDeviceName(defaultName).then((name) => {
      if (active) {
        setDeviceName(name);
        setDraftName(name);
      }
      // Silently register & heartbeat on launch so the dashboard shows Connected right away.
      ensureRegistered().then((res) => {
        if (!active) return;
        setConnection(res.ok ? 'ok' : 'offline');
        if (res.ok) {
          setDeviceId(res.data.deviceId);
          updateDeviceName(name);
          refreshPaired();
        }
      });
    });
    getPin().then((saved) => {
      if (active) setPin(saved);
    });
    return () => {
      active = false;
    };
  }, [defaultName]);

  const reading = sensor.status === 'ready' ? sensor.reading : null;
  const location = gps.status === 'ready' ? gps.point : null;
  const guard = useGuard(deviceId, reading, location, simulateError);
  const busy = sendStatus.kind === 'sending' || sendStatus.kind === 'retrying';
  const canSend = reading !== null && deviceId !== null && !busy;
  const canArm = reading !== null && deviceId !== null && guard.phase === 'disarmed' && dashboard?.paired === true;

  // While a code is showing, check every few seconds whether a dashboard has used it.
  // Codes work for a limited time: once this one has expired, say so instead of showing a code that no longer works.
  useEffect(() => {
    if (pairing.kind !== 'ready') return;
    const timer = setInterval(() => {
      if (Date.now() >= new Date(pairing.data.expires_at).getTime()) setPairing({ kind: 'expired' });
      else refreshPaired();
    }, 3000);
    return () => clearInterval(timer);
  }, [pairing]);
  // Done once a dashboard used the code: the first one, or a new one replacing the old (its pairing time changes).
  useEffect(() => {
    if (pairing.kind !== 'ready' || !dashboard?.paired) return;
    if (!pairing.before?.paired || dashboard.pairedAt !== pairing.before.pairedAt) setPairing({ kind: 'idle' });
  }, [dashboard, pairing]);
  // Arming refused (e.g. the only dashboard was removed): check again what the server says.
  useEffect(() => {
    if (guard.error) refreshPaired();
  }, [guard.error]);

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

  /** Asks first: deleting can't be undone, and every paired dashboard loses access. */
  function onDeleteMyData() {
    Alert.alert(
      'Delete my data?',
      "This deletes everything stored about this phone: readings, locations, alerts and paired dashboards. It can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting('deleting');
            const result = await deleteMyData();
            if (!result.ok) {
              setDeleting(result.reason);
              return;
            }
            setPairing({ kind: 'idle' });
            setDashboard(isMockMode ? { paired: true, pairedAt: null } : { paired: false, pairedAt: null });
            setLastPayload(null);
            guard.forgetLastSession();
            setDeleting('deleted');
            // Start over as a new phone.
            const fresh = await ensureRegistered();
            setConnection(fresh.ok ? 'ok' : 'offline');
            setDeviceId(fresh.ok ? fresh.data.deviceId : await getDeviceId());
          },
        },
      ],
    );
  }

  async function refreshPaired() {
    const result = await getDashboardPairing();
    if (result.ok) setDashboard(result.data);
  }

  async function onShowPairingCode() {
    setPairing({ kind: 'loading' });
    const result = await requestPairingCode({ retry: false });
    if (result.ok) {
      setPairing({ kind: 'ready', data: result.data, before: dashboard });
    } else {
      setPairing({ kind: 'failed', reason: result.reason });
    }
  }

  function startRenaming() {
    setDraftName(deviceName);
    setNameStatus('idle');
    setEditingName(true);
  }

  async function onSaveDeviceName() {
    const cleaned = draftName.trim() || defaultName;
    setNameStatus('saving');
    const result = await updateDeviceName(cleaned);
    if (result.ok) {
      const savedName = result.data.device_name || cleaned;
      setDeviceName(savedName);
      setDraftName(savedName);
      setEditingName(false);
      setNameStatus('saved');
    } else {
      setNameStatus(result.reason);
    }
  }

  /** The code to pair a dashboard, and the button for it. On the main screen before the first dashboard, in Settings after. */
  /** inList: shown inside the Settings list, so no frame of its own, and it can be closed. */
  function pairingBlock(idleLabel: string, inList = false) {
    return (
      <View style={inList ? styles.inlineBlock : styles.card}>
        {pairing.kind === 'ready' && (
          <>
            <Text style={styles.pairingCode}>
              {pairing.data.code.slice(0, 3)} {pairing.data.code.slice(3)}
            </Text>
            <Text style={[styles.small, styles.center]}>Enter this code on the dashboard. It works once, for 10 minutes.</Text>
          </>
        )}
        {pairing.kind === 'expired' && <Text style={[styles.small, styles.center]}>That code expired.</Text>}
        {pairing.kind === 'failed' && <Text style={[styles.small, styles.statusFailed]}>Couldn't get a code: {pairing.reason}</Text>}
        <Pressable
          onPress={onShowPairingCode}
          disabled={pairing.kind === 'loading' || deviceId === null}
          style={({ pressed }) => [
            styles.button,
            pairing.kind === 'ready' ? styles.secondaryButton : styles.armButton,
            (pairing.kind === 'loading' || deviceId === null) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={pairing.kind === 'ready' ? styles.secondaryText : styles.armText}>
            {pairing.kind === 'loading' ? 'Getting a code…' : pairing.kind === 'ready' || pairing.kind === 'expired' ? 'New code' : idleLabel}
          </Text>
        </Pressable>
        {inList && (
          <Pressable onPress={() => setPairing({ kind: 'idle' })} style={({ pressed }) => [styles.link, pressed && styles.buttonPressed]}>
            <Text style={styles.linkText}>Close</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const connectionLook = isMockMode
    ? { text: 'Demo mode', color: colors.warn }
    : connection === 'ok'
      ? { text: 'Connected', color: colors.ok }
      : connection === 'offline'
        ? { text: "Can't reach the server", color: colors.warn }
        : { text: 'Connecting…', color: colors.muted };

  // Wait for the typeface (a moment on first launch); without it, carry on with the system font.
  if (!fontsLoaded && !fontError) return <View style={styles.screen} />;

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
        <Text style={styles.title}>{pinSetup.step === 'confirm' ? 'Enter it again' : 'Set a PIN'}</Text>
        <Text style={[styles.small, styles.center]}>
          {pinSetup.mismatch
            ? "The PINs didn't match. Try again."
            : 'Four digits. While the phone is guarding, this PIN is the only way to stop it. It stays on this phone.'}
        </Text>
        <PinPad color={colors.ink} pressedColor={colors.line} onComplete={onPinEntered} />
        <Pressable onPress={() => setPinSetup(null)} style={({ pressed }) => [styles.link, pressed && styles.buttonPressed]}>
          <Text style={styles.linkText}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={styles.title}>StayPut</Text>
          <View style={styles.connection}>
            <View style={[styles.dot, { backgroundColor: connectionLook.color }]} />
            <Text style={[styles.connectionText, { color: connectionLook.color }]}>{connectionLook.text}</Text>
          </View>
        </View>

        {guard.lastSession && <LastSession session={guard.lastSession} />}

        {dashboard?.paired === false ? (
          <>
            <View style={styles.intro}>
              <Text style={styles.headline}>Pair a dashboard first</Text>
              <Text style={styles.body}>
                The dashboard is where the alarm shows up. Show a code here and enter it on the dashboard; then you can start guarding.
              </Text>
            </View>
            {pairingBlock('Show dashboard code')}
          </>
        ) : dashboard === null ? (
          <View style={styles.intro}>
            <Text style={styles.headline}>{connection === 'offline' ? "Can't reach the server" : 'Connecting…'}</Text>
            <Text style={styles.body}>
              {connection === 'offline' ? 'Check the connection, then reopen the app.' : 'One moment.'}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={styles.headline}>{reading ? 'Ready to guard' : 'Waiting for the motion sensor…'}</Text>
              <Text style={styles.body}>
                Picking it up, tilting it or carrying it off sets off the alarm. Writing or typing at the same table doesn't.
              </Text>
            </View>
            <Pressable
              onPress={onArm}
              disabled={!canArm}
              style={({ pressed }) => [styles.button, styles.armButton, !canArm && styles.buttonDisabled, pressed && styles.buttonPressed]}
            >
              <Text style={styles.armText}>Start guarding</Text>
            </Pressable>
            {guard.error && <Text style={[styles.status, styles.statusFailed]}>{guard.error}</Text>}
          </>
        )}

        <Text style={styles.section}>Settings</Text>
        <View style={[styles.card, styles.list]}>
          {dashboard?.paired && (
            <View style={[styles.listRow, pairing.kind !== 'idle' && styles.lastRow]}>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>Dashboard</Text>
                <Text style={styles.small}>
                  {pairing.kind !== 'idle'
                    ? 'Enter the code on the new dashboard. The current one stops following.'
                    : dashboard.pairedAt
                      ? `Paired at ${new Date(dashboard.pairedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : 'Paired'}
                </Text>
              </View>
              {pairing.kind === 'idle' && (
                <Pressable onPress={onShowPairingCode} style={({ pressed }) => [styles.rowAction, pressed && styles.buttonPressed]}>
                  <Text style={styles.linkText}>Replace</Text>
                </Pressable>
              )}
            </View>
          )}
          {dashboard?.paired && pairing.kind !== 'idle' && pairingBlock('Show dashboard code', true)}
          <View style={styles.listRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Name</Text>
              {!editingName && (
                <Text style={styles.small} numberOfLines={1}>
                  {deviceName}
                  {nameStatus === 'saved' ? ' · saved' : ''}
                </Text>
              )}
            </View>
            {!editingName && (
              <Pressable onPress={startRenaming} style={({ pressed }) => [styles.rowAction, pressed && styles.buttonPressed]}>
                <Text style={styles.linkText}>Rename</Text>
              </Pressable>
            )}
          </View>
          {editingName && (
            <View style={styles.renameBox}>
              <TextInput
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Phone name"
                placeholderTextColor={colors.muted}
                maxLength={64}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                onSubmitEditing={onSaveDeviceName}
                style={styles.nameInput}
              />
              <View style={styles.renameActions}>
                <Pressable
                  onPress={() => {
                    setEditingName(false);
                    setNameStatus('idle');
                  }}
                  style={({ pressed }) => [styles.cancelButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={onSaveDeviceName}
                  disabled={nameStatus === 'saving'}
                  style={({ pressed }) => [styles.saveButton, nameStatus === 'saving' && styles.buttonDisabled, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.saveButtonText}>{nameStatus === 'saving' ? 'Saving…' : 'Save'}</Text>
                </Pressable>
              </View>
              {nameStatus !== 'idle' && nameStatus !== 'saving' && nameStatus !== 'saved' && (
                <Text style={[styles.small, styles.statusFailed]}>Not saved: {nameStatus}</Text>
              )}
            </View>
          )}

          <View style={styles.listRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>PIN</Text>
              <Text style={styles.small}>{pin ? 'Set. It stays on this phone.' : 'Asked for when you first start guarding.'}</Text>
            </View>
            <Pressable
              onPress={() => setPinSetup({ step: 'enter', thenArm: false })}
              style={({ pressed }) => [styles.rowAction, pressed && styles.buttonPressed]}
            >
              <Text style={styles.linkText}>{pin ? 'Change' : 'Set'}</Text>
            </Pressable>
          </View>

          <View style={styles.listRow}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Stealth</Text>
              <Text style={styles.small}>Black screen while guarding, so the phone looks switched off.</Text>
            </View>
            <Switch value={stealth} onValueChange={setStealth} trackColor={{ true: colors.accent, false: colors.line }} />
          </View>

          <View style={[styles.listRow, styles.lastRow]}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, styles.dangerText]}>Delete my data</Text>
              <Text style={styles.small}>
                {deleting === 'deleted'
                  ? 'Deleted. This phone starts over as a new one.'
                  : deleting !== 'idle' && deleting !== 'deleting'
                    ? `Not deleted: ${deleting}`
                    : 'Everything stored about this phone, and its dashboards.'}
              </Text>
            </View>
            <Pressable
              onPress={onDeleteMyData}
              disabled={guard.phase !== 'disarmed' || deleting === 'deleting'}
              style={({ pressed }) => [styles.rowAction, (pressed || deleting === 'deleting') && styles.buttonPressed]}
            >
              <Text style={[styles.linkText, styles.dangerText]}>{deleting === 'deleting' ? 'Deleting…' : 'Delete'}</Text>
            </Pressable>
          </View>
        </View>

        <Pressable onPress={() => setShowDeveloper((v) => !v)} style={({ pressed }) => [styles.disclosure, pressed && styles.buttonPressed]}>
          <Text style={styles.section}>Developer</Text>
          <Text style={styles.chevron}>{showDeveloper ? '−' : '+'}</Text>
        </Pressable>
        {showDeveloper && (
          <View style={styles.card}>
            <Text style={styles.small}>
              {deviceId ?? 'loading…'} · {Platform.OS} · {isMockMode ? 'mock mode, no server' : API_URL}
            </Text>
            <Text style={styles.small}>Accelerometer: {sensorLabel(sensor.status)}</Text>
            <View style={styles.axes}>
              <Axis name="x" value={reading?.x} />
              <Axis name="y" value={reading?.y} />
              <Axis name="z" value={reading?.z} />
              <Axis name="|a| g" value={reading?.magnitude} />
            </View>
            <Text style={styles.small}>
              Location: {location ? `${location.lat}, ${location.lon}. ` : ''}
              {locationLabel(gps)}
            </Text>
            <Pressable
              onPress={onSend}
              disabled={!canSend}
              style={({ pressed }) => [styles.button, styles.secondaryButton, !canSend && styles.buttonDisabled, pressed && styles.buttonPressed]}
            >
              <Text style={styles.secondaryText}>{busy ? 'Sending…' : 'Send reading'}</Text>
            </Pressable>
            <Text style={[styles.small, styles.center, sendStatus.kind === 'failed' && styles.statusFailed]}>{statusLabel(sendStatus)}</Text>
            {isMockMode && (
              <View style={styles.listRow}>
                <Text style={styles.small}>Simulate server error</Text>
                <Switch value={simulateError} onValueChange={setSimulateError} trackColor={{ true: colors.warn, false: colors.line }} />
              </View>
            )}
            {lastPayload && <Text style={styles.mono}>{JSON.stringify(lastPayload, null, 2)}</Text>}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LastSession({ session }: { session: SessionSummary }) {
  const since = new Date(session.armedAt).toLocaleTimeString();
  const { alert } = session;
  return (
    <View style={[styles.card, alert && styles.alertCard]}>
      <Text style={[styles.label, alert && styles.alertText]}>While you were away</Text>
      <Text style={[styles.sessionText, alert && styles.alertText]}>
        {alert
          ? `Picked up at ${new Date(alert.timestamp).toLocaleTimeString()} (${Math.round(alert.angle_deg)}°)`
          : `Nothing happened (guarding since ${since})`}
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
      return 'Permission denied: guarding works without location';
    case 'ready':
      if (!gps.point) return 'Waiting for a fix…';
      return `${gps.point.accuracy_m === null ? '' : `±${gps.point.accuracy_m} m. `}Sent when guarding starts, with Send reading, and after an alert`;
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
  content: { padding: 20, paddingTop: 64, paddingBottom: 48, gap: 14 },
  center: { textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontFamily: fonts.bold, fontSize: 30, color: colors.ink, letterSpacing: -0.8 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  connectionText: { fontFamily: fonts.medium, fontSize: 14 },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 10 },
  alertCard: { backgroundColor: colors.alertSoft, borderColor: colors.alert },
  alertText: { color: colors.alert },
  sessionText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.ink },
  label: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  section: { fontFamily: fonts.semibold, fontSize: 16, color: colors.muted, marginTop: 10 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: colors.muted },
  intro: { gap: 8, marginTop: 12, marginBottom: 4 },
  headline: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: -0.6, color: colors.ink },
  list: { paddingVertical: 4, gap: 0 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  lastRow: { borderBottomWidth: 0 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  rowAction: { paddingVertical: 6, paddingLeft: 12 },
  renameBox: { paddingBottom: 12, gap: 10 },
  // The code inside the Settings list: one divider below it, none between the row and the code.
  inlineBlock: { gap: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.line },
  nameInput: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.page,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  cancelButtonText: { fontFamily: fonts.semibold, color: colors.muted, fontSize: 14 },
  saveButton: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  saveButtonText: { fontFamily: fonts.bold, color: colors.onAccent, fontSize: 14 },
  pairingCode: {
    fontFamily: fonts.bold,
    fontSize: 40,
    letterSpacing: 6,
    textAlign: 'center',
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  disclosure: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  chevron: { fontFamily: fonts.medium, fontSize: 20, color: colors.muted },
  axes: { flexDirection: 'row', justifyContent: 'space-between' },
  axis: { alignItems: 'center', flex: 1 },
  axisValue: { fontFamily: fonts.semibold, fontSize: 18, fontVariant: ['tabular-nums'], color: colors.ink },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 12, color: colors.muted },
  button: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  armButton: { backgroundColor: colors.accent, paddingVertical: 20 },
  armText: { fontFamily: fonts.bold, color: colors.onAccent, fontSize: 20 },
  secondaryButton: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.page },
  secondaryText: { fontFamily: fonts.semibold, color: colors.ink, fontSize: 16 },
  buttonDisabled: { opacity: 0.4 },
  buttonPressed: { opacity: 0.7 },
  link: { alignSelf: 'center', padding: 8 },
  linkText: { fontFamily: fonts.semibold, color: colors.accent, fontSize: 15 },
  dangerText: { color: colors.alert },
  status: { fontFamily: fonts.regular, fontSize: 15, textAlign: 'center', color: colors.ink },
  statusFailed: { color: colors.warn },
});
