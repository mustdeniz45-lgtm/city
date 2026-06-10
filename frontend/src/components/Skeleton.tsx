import { ScrollView, StyleSheet, View } from "react-native";
import { colors, radius, spacing } from "@/src/theme";

const Bar = ({ width, height = 14 }: { width: number | string; height?: number }) => (
  <View style={[styles.bar, { width: width as any, height }]} />
);

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Bar width="60%" height={18} />
      <View style={{ height: 8 }} />
      <Bar width="90%" />
      <View style={{ height: 6 }} />
      <Bar width="40%" />
    </View>
  );
}

export function SkeletonList() {
  return (
    <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  bar: { backgroundColor: colors.surfaceTertiary, borderRadius: 6 },
});
