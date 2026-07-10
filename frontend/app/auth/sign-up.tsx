import { useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { useApp } from "@/src/store";
import { api } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUpWithEmail, getAccessToken } = useAuth();
  const { deviceId, refreshProgress } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);

  const valid = email.includes("@") && password.length >= 6;

  const onSubmit = async () => {
    if (!valid) {
      Alert.alert("Check your details", "Email must be valid and password ≥ 6 characters.");
      return;
    }
    setBusy(true);
    try {
      const { needsConfirmation } = await signUpWithEmail(email, password);
      if (needsConfirmation) {
        Alert.alert(
          "Check your inbox",
          "We sent a confirmation link. After confirming, sign in to sync your progress.",
          [{ text: "Got it", onPress: () => router.replace("/auth/sign-in") }]
        );
        return;
      }
      // Auto-signed-in (email confirmation disabled). Link device.
      try {
        const token = await getAccessToken();
        if (token && deviceId) await api.linkDevice(token, deviceId);
      } catch (e) {
        console.warn("link-device failed (non-fatal)", e);
      }
      refreshProgress();
      router.replace("/(tabs)/profile");
    } catch (e: any) {
      Alert.alert("Sign up failed", e?.message ?? "Please try again.");
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
        <Pressable onPress={() => router.back()} hitSlop={12} testID="signup-back">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.kicker}>JOIN CITYQUEST</Text>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Your XP, badges, and stamps will be saved to your account from now on.</Text>

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
            testID="signup-email"
          />
        </Field>
        <Field label="Password (6+ characters)">
          <View style={styles.row}>
            <TextInput
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPwd}
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              style={[styles.input, { flex: 1 }]}
              testID="signup-password"
            />
            <Pressable onPress={() => setShowPwd(s => !s)} hitSlop={10} style={styles.eye}>
              <Ionicons name={showPwd ? "eye-off" : "eye"} size={20} color={colors.muted} />
            </Pressable>
          </View>
        </Field>

        <Pressable onPress={onSubmit} disabled={busy} style={[styles.btn, busy && styles.btnDisabled]} testID="signup-submit">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create account</Text>}
        </Pressable>

        <Pressable onPress={() => router.replace("/auth/sign-in")} style={{ marginTop: spacing.lg }}>
          <Text style={styles.link}>Already have an account? <Text style={{ color: colors.brand, fontWeight: "700" }}>Sign in</Text></Text>
        </Pressable>

        <Text style={styles.legal}>By continuing, you agree to our Terms of Service and Privacy Policy.</Text>
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
  link: { textAlign: "center", color: colors.muted, fontSize: 13.5 },
  legal: { textAlign: "center", color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: spacing.lg, paddingHorizontal: spacing.md },
});
