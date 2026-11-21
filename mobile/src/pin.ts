import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'disarm_pin';
export const PIN_LENGTH = 4;


export function getPin(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export function savePin(pin: string): Promise<void> {
  return AsyncStorage.setItem(KEY, pin);
}
