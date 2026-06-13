import { StyleSheet, Text, View, Pressable, ScrollView, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1583395145806-c5ea1d4dc7d5?w=1200&q=80";

export default function AuthWelcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="auth-welcome">
      <Image source={HERO} style={styles.hero} contentFit="cover" />
      <View style={styles.heroOverlay} />
      <Pressable
        onPress={() => router.back()}
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        hitSlop={12}
        testID="welcome-close"
      >
        <Ionicons name="close" size={24} color="#fff" />
      </Pressable>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 220, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.kicker}>CITYQUEST</Text>
          <Text style={styles.title}>Save your journey</Text>
          <Text style={styles.subtitle}>
            Sign in to sync your XP, badges, and stamps across devices. Continue as a guest if you just want to explore.
          </Text>

          <View style={styles.bullets}>
            <Bullet icon="sync" text="Cross-device progress sync" />
            <Bullet icon="shield-checkmark" text="Your XP is safely backed up" />
            <Bullet icon="earth" text="Climb a global leaderboard" />
          </View>

          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.push("/auth/sign-up")}
            testID="btn-go-signup"
          >
            <Text style={styles.primaryText}>Create an account</Text>
          </Pressable>

          <Pressable
            style={styles.secondaryBtn}
            onPress={() => router.push("/auth/sign-in")}
            testID="btn-go-signin"
          >
            <Text style={styles.secondaryText}>I already have an account</Text>
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.line} /><Text style={styles.or}>OR</Text><View style={styles.line} />
          </View>

          <Pressable onPress={() => router.back()} style={styles.ghostBtn} testID="btn-guest">
            <Text style={styles.ghostText}>Continue as guest →</Text>
          </Pressable>
          <Text style={styles.tinyHint}>You can sign in later from the Profile tab.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Bullet({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.bulletIcon}><Ionicons name={icon} size={14} color={colors.brand} /></View>
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { position: "absolute", top: 0, left: 0, right: 0, height: 320 },
  heroOverlay: { position: "absolute", top: 0, left: 0, right: 0, height: 320, backgroundColor: "rgba(0,0,0,0.32)" },
  closeBtn: {
    position: "absolute", left: 16, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center",
  },
  scroll: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    padding: spacing.xl, ...shadow.card,
    borderWidth: 1, borderColor: colors.border,
  },
  kicker: { fontSize: 11, letterSpacing: 2, color: colors.brand, fontWeight: "700" },
  title: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, marginTop: 6 },
  subtitle: { fontSize: 14, color: colors.muted, marginTop: 8, lineHeight: 21 },
  bullets: { gap: 10, marginTop: spacing.lg, marginBottom: spacing.lg },
  bullet: { flexDirection: "row", alignItems: "center", gap: 10 },
  bulletIcon: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#FCE9E1", alignItems: "center", justifyContent: "center" },
  bulletText: { fontSize: 13.5, color: colors.onSurface, flex: 1 },
  primaryBtn: {
    backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center", ...shadow.pill,
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
  secondaryBtn: {
    marginTop: 10, paddingVertical: 14, borderRadius: radius.pill,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: colors.onSurface,
  },
  secondaryText: { color: colors.onSurface, fontWeight: "700", fontSize: 14.5 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { fontSize: 11, fontWeight: "700", color: colors.muted, letterSpacing: 2 },
  ghostBtn: { paddingVertical: 8, alignItems: "center" },
  ghostText: { color: colors.muted, fontWeight: "600", fontSize: 14 },
  tinyHint: { textAlign: "center", color: colors.muted, fontSize: 11, marginTop: 4 },
});
