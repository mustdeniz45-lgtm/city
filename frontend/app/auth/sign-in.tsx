import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { useApp } from "@/src/store";
import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInWithEmail, signInWithGoogle, signInWithApple, getAccessToken } = useAuth();
  const { deviceId, refreshProgress } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) {
      Alert.alert("Missing fields", "Please enter both your email and password.");
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email, password);
      // Attach progress
      try {
        const token = await getAccessToken();
        if (token && deviceId) await api.linkDevice(token, deviceId);
      } catch (e) {
        console.warn("link-device failed (non-fatal)", e);
      }
      refreshProgress();
      router.replace("/(tabs)/profile");
    } catch (e: any) {
      Alert.alert("Sign in failed", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.surface }}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} testID="signin-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>WELCOME BACK</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.subtitle}>Use the email and password you signed up with.</Text>

        <Field label="Email">
          <TextInput
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            style={styles.input}
            testID="signin-email"
          />
        </Field>
        <Field label="Password">
          <View style={styles.row}>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              style={[styles.input, { flex: 1 }]}
              testID="signin-password"
            />
            <Pressable onPress={() => setShowPwd(s => !s)} hitSlop={10} style={styles.eye}>
              <Ionicons name={showPwd ? "eye-off" : "eye"} size={20} color={colors.muted} />
            </Pressable>
          </View>
        </Field>

        <Pressable onPress={onSubmit} disabled={busy} style={[styles.btn, busy && styles.btnDisabled]} testID="signin-submit">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Sign in</Text>}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <Pressable
          onPress={async () => {
            setBusy(true); setErr(null);
            try { await signInWithGoogle(); }
            catch (e: any) { setErr(e?.message ?? "Google sign-in failed"); }
            finally { setBusy(false); }
          }}
          disabled={busy}
          style={[styles.oauthBtn, busy && styles.btnDisabled]}
          testID="signin-google"
        >
          <Ionicons name="logo-google" size={18} color={colors.onSurface} />
          <Text style={styles.oauthText}>Continue with Google</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            setBusy(true); setErr(null);
            try { await signInWithApple(); }
            catch (e: any) { setErr(e?.message ?? "Apple sign-in failed"); }
            finally { setBusy(false); }
          }}
          disabled={busy}
          style={[styles.oauthBtn, styles.oauthBtnApple, busy && styles.btnDisabled]}
          testID="signin-apple"
        >
          <Ionicons name="logo-apple" size={20} color="#FFF" />
          <Text style={[styles.oauthText, { color: "#FFF" }]}>Continue with Apple</Text>
        </Pressable>

        <Pressable onPress={() => router.replace("/auth/sign-up")} style={{ marginTop: spacing.lg }}>
          <Text style={styles.link}>Don&apos;t have an account? <Text style={{ color: colors.brand, fontWeight: "700" }}>Sign up</Text></Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl },
  kicker: { fontSize: 11, letterSpacing: 2, color: colors.brand, fontWeight: "700", marginTop: spacing.sm },
  title: { fontFamily: fonts.display, fontSize: 32, color: colors.onSurface, marginTop: 4 },
  subtitle: { fontSize: 13.5, color: colors.muted, marginTop: 6, marginBottom: spacing.lg },
  label: { fontSize: 12, fontWeight: "700", color: colors.muted, letterSpacing: 0.5, marginBottom: 6 },
  input: {
    fontSize: 15, color: colors.onSurface,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  row: { flexDirection: "row", alignItems: "center", position: "relative" },
  eye: { position: "absolute", right: 12 },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center", ...shadow.pill, minHeight: 48,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.md, gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.muted, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
  oauthBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  oauthBtnApple: { backgroundColor: "#000", borderColor: "#000" },
  oauthText: { color: colors.onSurface, fontWeight: "700", fontSize: 15, letterSpacing: 0.2 },
  link: { textAlign: "center", color: colors.muted, fontSize: 13.5 },
});
