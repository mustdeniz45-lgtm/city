import { useEffect } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors, fonts, spacing } from "@/src/theme";

/**
 * Callback landing page for Supabase-managed OAuth redirects.
 *
 * On WEB, supabase-js auto-detects the `?code=` in the URL and exchanges it
 * for a session on client boot (because `detectSessionInUrl: true` on web).
 * On NATIVE, this route is unreachable — the deep link is handled by
 * `WebBrowser.openAuthSessionAsync` inside signInWithOAuth().
 *
 * Once `session` becomes non-null, we bounce the user to the main app.
 */
export default function AuthCallback() {
  const router = useRouter();
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && session) {
      router.replace("/(tabs)/explore");
    }
  }, [loading, session, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.text}>Finishing sign-in…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, gap: spacing.lg },
  text: { color: colors.text, fontFamily: fonts.display, fontSize: 16 },
});
