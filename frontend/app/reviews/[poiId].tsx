/**
 * "See all reviews" screen — `/reviews/[poiId]`.
 *
 * Renders the full list of reviews for a POI (paged out only if very long
 * on the backend, which caps at 100). Reuses the ReviewItem component so
 * layout stays consistent with the POI detail preview.
 *
 * Includes a lightweight sort toggle (Newest / Most helpful) — the API
 * already sorts by helpful_count desc, so "Newest" is client-side.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, type POI, type ReviewRow } from "@/src/api";
import { ReviewItem } from "@/src/components/ReviewsSection";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Sort = "helpful" | "recent";

export default function AllReviewsScreen() {
  const router = useRouter();
  const { poiId } = useLocalSearchParams<{ poiId: string }>();
  const [poi, setPoi] = useState<POI | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [sort, setSort] = useState<Sort>("helpful");

  const load = useCallback(async () => {
    if (!poiId) return;
    try {
      const [p, r] = await Promise.all([api.poi(poiId), api.reviews(poiId)]);
      setPoi(p); setReviews(r);
    } catch (e) { console.warn("all reviews load", e); }
  }, [poiId]);
  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    if (!reviews) return [];
    const arr = [...reviews];
    if (sort === "recent") {
      arr.sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } else {
      arr.sort((a, b) => (b.helpful_count ?? 0) - (a.helpful_count ?? 0) ||
        (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    }
    return arr;
  }, [reviews, sort]);

  return (
    <View style={styles.container} testID="all-reviews-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {poi?.name ? `Reviews · ${poi.name}` : "All reviews"}
          </Text>
          <Text style={styles.sub}>
            {reviews == null ? "Loading…" : `${reviews.length} review${reviews.length === 1 ? "" : "s"}`}
          </Text>
        </View>
      </View>

      {reviews && reviews.length > 0 && (
        <View style={styles.sortRow}>
          <SortChip label="Most helpful" active={sort === "helpful"} onPress={() => setSort("helpful")} />
          <SortChip label="Newest first"  active={sort === "recent"}  onPress={() => setSort("recent")} />
        </View>
      )}

      {reviews == null ? (
        <View style={styles.centerFill}><ActivityIndicator color={colors.brand} /></View>
      ) : reviews.length === 0 ? (
        <View style={styles.centerFill}>
          <Ionicons name="chatbubble-ellipses-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>No reviews yet</Text>
          <Text style={styles.emptyBody}>Be the first to share your experience — check in and write a verified review.</Text>
          <Pressable onPress={() => router.replace(`/poi/${poiId}`)} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>Back to place</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={sorted}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <ReviewItem r={item} />}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}
    </View>
  );
}

function SortChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} testID={`sort-${label}`}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.xxxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sortRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: "#FFF" },
  list: { padding: spacing.lg, paddingBottom: 60 },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.xl },
  emptyTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.sm },
  emptyBody: { color: colors.muted, textAlign: "center", fontSize: 13, lineHeight: 19 },
  emptyBtn: { marginTop: spacing.md, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill },
  emptyBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13 },
});
