/**
 * StampBadge — the visual medallion for a passport tier.
 *
 * Deliberately a pure presentational component with NO knowledge of
 * navigation or data. Renders bronze / silver / gold / diamond gradients
 * with an icon + label. `size` = "sm" | "md" | "lg" scales the whole thing
 * for use in list rows, hero cards, and celebration modals.
 */
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "@/src/theme";
import type { StampTier } from "@/src/api";

type Props = { tier: StampTier | null; size?: "sm" | "md" | "lg"; showLabel?: boolean };

// Metal-tone gradients tuned to feel tactile — the darker second stop is
// what gives the medallion a "3D" edge without any shadow layer.
const GRADIENTS: Record<StampTier, [string, string]> = {
  bronze:  ["#D28B4D", "#8B4A21"],
  silver:  ["#E5E4E2", "#8E8E8E"],
  gold:    ["#FDE28A", "#B58A25"],
  diamond: ["#B8EAF6", "#4B8BB1"],
};

const LABELS: Record<StampTier, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", diamond: "Diamond",
};

const DIMENSIONS: Record<"sm" | "md" | "lg", { d: number; icon: number; label: number }> = {
  sm: { d: 36, icon: 14, label: 9 },
  md: { d: 60, icon: 22, label: 10 },
  lg: { d: 120, icon: 46, label: 14 },
};

export default function StampBadge({ tier, size = "md", showLabel = true }: Props) {
  const dim = DIMENSIONS[size];
  if (!tier) {
    return (
      <View
        style={[styles.medal, { width: dim.d, height: dim.d, borderRadius: dim.d / 2 }, styles.medalEmpty]}
        testID="stamp-badge-empty"
      >
        <Ionicons name="ribbon-outline" size={dim.icon} color={colors.muted} />
      </View>
    );
  }
  return (
    <View style={{ alignItems: "center" }} testID={`stamp-badge-${tier}`}>
      <LinearGradient
        colors={GRADIENTS[tier]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.medal,
          { width: dim.d, height: dim.d, borderRadius: dim.d / 2 },
        ]}
      >
        <Ionicons name="ribbon" size={dim.icon} color="#FFF" />
      </LinearGradient>
      {showLabel && (
        <Text style={[styles.label, { fontSize: dim.label }]}>
          {LABELS[tier].toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  medal: {
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "rgba(255,255,255,0.6)",
  },
  medalEmpty: {
    backgroundColor: colors.surfaceSecondary,
    borderColor: colors.border,
  },
  label: {
    fontFamily: fonts.display,
    color: colors.onSurface,
    letterSpacing: 2,
    marginTop: 4,
  },
});
