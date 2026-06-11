import { useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, TextInput } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type POI } from "@/src/api";
import { useApp } from "@/src/store";
import { SkeletonList } from "@/src/components/Skeleton";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function FoodScreen() {
  const { activeCityId } = useApp();
  const [food, setFood] = useState<POI[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setFood(await api.food(activeCityId)); }
    catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { setLoading(true); load(); }, [activeCityId]);

  const filtered = food.filter(f =>
    !query.trim() || f.name.toLowerCase().includes(query.toLowerCase()) || f.description.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="food-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>GASTRONOMY</Text>
        <Text style={styles.h1}>Iconic flavors</Text>
        <Text style={styles.subtitle}>Curated restaurants and signature dishes.</Text>
        <View style={styles.searchBar} testID="food-search">
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            placeholder="Search restaurants..."
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(f) => f.id}
        renderItem={({ item }) => <FoodCard f={item} />}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: spacing.sm }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={loading ? <SkeletonList /> : <Text style={styles.empty}>No restaurants found.</Text>}
      />
    </View>
  );
}

function FoodCard({ f }: { f: POI }) {
  const router = useRouter();
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/poi/${f.id}`)}
      testID={`food-card-${f.id}`}
    >
      <Image source={f.image} style={styles.cardImage} contentFit="cover" />
      <View style={styles.cardBody}>
        <View style={styles.row}>
          <Text style={styles.cardTitle} numberOfLines={1}>{f.name}</Text>
          <View style={styles.rating}>
            <Ionicons name="star" size={12} color={colors.brandSecondary} />
            <Text style={styles.ratingText}>{f.rating.toFixed(1)}</Text>
          </View>
        </View>
        <Text style={styles.cardDesc} numberOfLines={2}>{f.description}</Text>
        <View style={styles.footerRow}>
          <View style={styles.xpBadge}>
            <Ionicons name="flash" size={11} color={colors.brand} />
            <Text style={styles.xpText}>+{f.xp_reward} XP for visiting</Text>
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.muted} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.xxxl + spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: "700", color: colors.brand },
  h1: { fontFamily: fonts.display, fontSize: 30, color: colors.onSurface, marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: spacing.md, marginTop: 4 },
  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface },
  card: { marginHorizontal: spacing.lg, flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardImage: { width: 110, height: 130 },
  cardBody: { flex: 1, padding: spacing.md, justifyContent: "space-between" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginRight: spacing.sm },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontSize: 12, color: colors.onSurfaceTertiary, fontWeight: "600" },
  cardDesc: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  xpBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FCE9E1", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  xpText: { color: colors.brand, fontWeight: "700", fontSize: 11 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  empty: { textAlign: "center", color: colors.muted, padding: spacing.xl },
});
