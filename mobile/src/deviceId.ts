import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'device_id';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateDeviceId(): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `phone-${suffix}`;
}

/** Returns the device ID saved on this phone, creating it on first launch. */
export async function getDeviceId(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY);
  if (saved) return saved;

  const id = generateDeviceId();
  await AsyncStorage.setItem(KEY, id);
  return id;
}
