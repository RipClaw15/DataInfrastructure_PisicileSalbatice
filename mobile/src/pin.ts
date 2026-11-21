import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'disarm_pin';
export const PIN_LENGTH = 4;

/** The disarm PIN saved on this phone, or null before it's set. It never leaves the phone. */
export function getPin(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export function savePin(pin: string): Promise<void> {
  return AsyncStorage.setItem(KEY, pin);
}
