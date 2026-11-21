import AsyncStorage from '@react-native-async-storage/async-storage';

const ID_KEY = 'device_id';
const TOKEN_KEY = 'device_token';
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
  const saved = await AsyncStorage.getItem(ID_KEY);
  if (saved) return saved;

  const id = generateDeviceId();
  await AsyncStorage.setItem(ID_KEY, id);
  return id;
}

/** Replaces the stored device ID (e.g. if a stale ID collided on registration). */
export async function regenerateDeviceId(): Promise<string> {
  const id = generateDeviceId();
  await AsyncStorage.setItem(ID_KEY, id);
  await AsyncStorage.removeItem(TOKEN_KEY);
  return id;
}

export async function getDeviceToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function saveDeviceToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearDeviceToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}
