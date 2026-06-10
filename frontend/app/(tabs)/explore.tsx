import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type City, type POI } from "@/src/api";
import { useApp } from "@/src/store";
import { CityHeader } from "@/src/components/CityHeader";
import { SkeletonList } from "@/src/components/Skeleton";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

const CATEGORIES = [
  { id: "all", label: "All", icon: "apps-outline" as const },
  { id: "kultur-yolu", label: "Kültür Yolu", icon: "footsteps-outline" as const },
  { id: "landmark", label: "Landmarks", icon: "flag-outline" as const },
  { id: "museum", label: "Museums", icon: "library-outline" as const },
  { id: "historic", label: "Historic", icon: "time-outline" as const },
  { id: "must-see", label: "Must-See", icon: "star-outline" as const },
  { id: "restaurant", label: "Food", icon: "restaurant-outline" as const },
];

export default function ExploreScreen() {
  const { activeCityId } = useApp();
  const [city, setCity] = useState<City | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = async () => {
    try {
      let p: POI[];
      if (category === "kultur-yolu") {
        const [c, ky] = await Promise.all([api.city(activeCityId), api.kulturYolu(activeCityId)]);
        setCity(c);
        p = ky.sort((a, b) => (a.ky_seq ?? 0) - (b.ky_seq ?? 0));
      } else {
        const [c, all] = await Promise.all([api.city(activeCityId), api.pois(activeCityId, category)]);
        setCity(c);
        // Hide Kültür Yolu entries from generic categories to keep the feed curated.
        p = category === "all" ? all.filter((x) => !x.kultur_yolu) : all;
      }
      setPois(p);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { setLoading(true); load(); }, [activeCityId, category]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="explore-screen">
      <FlatList
        data={pois}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={
          <View>
            {city && <CityHeader city={city} />}
            <View style={styles.intro}>
              <Text style={styles.kicker}>DISCOVER</Text>
              <Text style={styles.h1}>Places to explore</Text>
              <Text style={styles.subtitle}>{city?.description}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              testID="explore-category-row"
            >
              {CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategory(c.id)}
                    style={[styles.chip, active && styles.chipActive]}
                    testID={`explore-chip-${c.id}`}
                  >
                    <Ionicons name={c.icon} size={14} color={active ? "#FFF" : colors.onSurfaceTertiary} />
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        }
        renderItem={({ item }) => <POICard poi={item} />}
        contentContainerStyle={{ paddingBottom: 120 }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={loading ? <SkeletonList /> : <Text style={styles.empty}>No places yet.</Text>}
      />
    </View>
  );
}

function POICard({ poi }: { poi: POI }) {
  return (
    <View style={styles.card} testID={`poi-card-${poi.id}`}>
      <Image source={poi.image} style={styles.cardImage} contentFit="cover" />
      <View style={styles.cardBody}>
        <View style={styles.cardCategoryRow}>
          <Text style={styles.cardCategory}>
            {poi.kultur_yolu ? `KÜLTÜR YOLU · #${poi.ky_seq}` : poi.category.toUpperCase()}
          </Text>
          <View style={styles.rating}>
            <Ionicons name="star" size={11} color={colors.brandSecondary} />
            <Text style={styles.ratingText}>{poi.rating.toFixed(1)}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{poi.name}</Text>
        {poi.name_tr && poi.name_tr !== poi.name && (
          <Text style={styles.cardSubtitle} numberOfLines={1}>{poi.name_tr}</Text>
        )}
        <Text style={styles.cardDesc} numberOfLines={2}>{poi.description}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.xpBadge}>
            <Ionicons name="flash" size={11} color={colors.brand} />
            <Text style={styles.xpText}>+{poi.xp_reward} XP</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md, backgroundColor: colors.surface },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: "700", color: colors.brand },
  h1: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface, marginTop: 4, marginBottom: 6 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  chipRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm, backgroundColor: colors.surface },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  chipActive: { backgroundColor: colors.onSurface, borderColor: colors.onSurface },
  chipText: { fontSize: 13, fontWeight: "600", color: colors.onSurfaceTertiary },
  chipTextActive: { color: "#FFF" },
  card: { marginHorizontal: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardImage: { width: "100%", height: 180 },
  cardBody: { padding: spacing.lg },
  cardCategoryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardCategory: { fontSize: 10, letterSpacing: 1.5, color: colors.brandTertiary, fontWeight: "700" },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontSize: 12, color: colors.onSurfaceTertiary, fontWeight: "600" },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface, marginBottom: 4 },
  cardSubtitle: { fontStyle: "italic", color: colors.brandTertiary, fontSize: 12, marginBottom: 4 },
  cardDesc: { color: colors.muted, fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  cardFooter: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  xpBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FCE9E1", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  xpText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  empty: { textAlign: "center", color: colors.muted, padding: spacing.xl },
});
