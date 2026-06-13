import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars missing — auth disabled.");
}

/**
 * Cross-platform secure-ish session storage:
 *  - Native (iOS/Android): expo-secure-store (Keychain / Keystore).
 *    Falls back to AsyncStorage if the value exceeds SecureStore's 2KB limit.
 *  - Web: AsyncStorage (which uses localStorage under the hood).
 */
const SecureChunkAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === "web") return AsyncStorage.getItem(key);
    try {
      const v = await SecureStore.getItemAsync(key);
      if (v !== null) return v;
    } catch {}
    // fallback if it was previously stored in AsyncStorage (too-large session)
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // 2KB limit hit on SecureStore — fall back to AsyncStorage.
      await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === "web") return AsyncStorage.removeItem(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
    await AsyncStorage.removeItem(key);
  },
};

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    storage: SecureChunkAdapter as any,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
