import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!url || !anonKey) {
  // eslint-disable-next-line no-console
  console.warn("Supabase env vars missing — falling back to FastAPI/Mongo only.");
}

// Session persistence is handled manually via expo-secure-store / AsyncStorage
// in the auth hook (added in a later step).
export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
