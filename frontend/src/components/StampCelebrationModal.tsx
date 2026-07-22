/**
 * StampCelebrationModal — full-screen "you leveled up your passport!"
 * dialog that shows on the very check-in that bumps the tier.
 *
 * The modal is intentionally cheap to render (no confetti library) — just
 * the medallion, a title, the XP burst, and a Dismiss button. The
 * hosting screen owns visibility so we can drive it from a single
 * check-in response field (`stamp_upgraded`).
 */
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import StampBadge from "./StampBadge";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { StampTier } from "@/src/api";

type Props = {
  visible: boolean;
  tier: StampTier | null;
  bonusXp: number;
  cityName?: string;
  onDismiss: () => void;
};

const HEADLINES: Record<StampTier, string> = {
  bronze:  "Bronze stamp earned!",
  silver:  "Silver stamp earned!",
  gold:    "Gold stamp earned!",
  diamond: "Diamond stamp — you completed the city!",
};

export default function StampCelebrationModal({
  visible, tier, bonusXp, cityName, onDismiss,
}: Props) {
  // Fire a big success haptic the very first frame the modal appears — it
  // doubles as feedback that the check-in was accepted, in case the user
  // missed the small toast.
  useEffect(() => {
    if (visible && tier) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [visible, tier]);

  if (!tier) return null;
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card} testID="stamp-celebration-modal">
          <StampBadge tier={tier} size="lg" showLabel={false} />
          <Text style={styles.title}>{HEADLINES[tier]}</Text>
          {cityName && <Text style={styles.city}>{cityName}</Text>}
          <View style={styles.xpBurst}>
            <Text style={styles.xpText}>+{bonusXp} XP</Text>
          </View>
          <Text style={styles.body}>
            Keep exploring to unlock the next tier. Each new category you visit
            counts toward your progress.
          </Text>
          <Pressable
            onPress={onDismiss}
            style={styles.cta}
            testID="stamp-celebration-dismiss"
          >
            <Text style={styles.ctaText}>Awesome</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(28,26,23,0.75)",
    alignItems: "center", justifyContent: "center", padding: spacing.lg,
  },
  card: {
    width: "100%", maxWidth: 380, backgroundColor: colors.surface,
    borderRadius: radius.lg, padding: spacing.xl,
    alignItems: "center", gap: spacing.md,
  },
  title: {
    fontFamily: fonts.display, fontSize: 22, color: colors.onSurface,
    textAlign: "center", marginTop: spacing.md,
  },
  city: {
    color: colors.muted, fontSize: 12, letterSpacing: 2, fontWeight: "700",
    textTransform: "uppercase",
  },
  xpBurst: {
    backgroundColor: colors.brand, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 999, marginTop: spacing.sm,
  },
  xpText: {
    color: "#FFF", fontFamily: fonts.display, fontSize: 24, letterSpacing: 1,
  },
  body: {
    textAlign: "center", color: colors.muted, fontSize: 13.5, lineHeight: 20,
    marginTop: spacing.sm,
  },
  cta: {
    backgroundColor: colors.onSurface, paddingHorizontal: 32, paddingVertical: 12,
    borderRadius: 999, marginTop: spacing.md,
  },
  ctaText: { color: "#FFF", fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
});
