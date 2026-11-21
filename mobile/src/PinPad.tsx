import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PIN_LENGTH } from './pin';
import { fonts } from './theme';

type Props = {
  /** Called with the full PIN; the pad clears itself either way. */
  onComplete: (pin: string) => void;
  /** Any key press (to keep the pad from hiding while someone types). */
  onKey?: () => void;
  color: string;
  /** Key background while pressed; none on the stealth screen, so nothing lights up. */
  pressedColor?: string;
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/** Four dots and a keypad. No labels and no "wrong PIN" message: a wrong PIN just clears. */
export function PinPad({ onComplete, onKey, color, pressedColor }: Props) {
  const [digits, setDigits] = useState('');

  function press(key: string) {
    onKey?.();
    if (key === '⌫') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    const next = digits + key;
    if (next.length < PIN_LENGTH) {
      setDigits(next);
      return;
    }
    setDigits('');
    onComplete(next);
  }

  return (
    <View style={styles.pad}>
      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, { borderColor: color }, i < digits.length && { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.keys}>
        {KEYS.map((key, i) =>
          key === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(key)}
              style={({ pressed }) => [styles.key, pressed && pressedColor !== undefined && { backgroundColor: pressedColor }]}
            >
              <Text style={[styles.keyText, { color }]}>{key}</Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { alignItems: 'center', gap: 28 },
  dots: { flexDirection: 'row', gap: 18 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', width: 264, justifyContent: 'center' },
  key: { width: 88, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36 },
  keyText: { fontFamily: fonts.regular, fontSize: 30, fontVariant: ['tabular-nums'] },
});
