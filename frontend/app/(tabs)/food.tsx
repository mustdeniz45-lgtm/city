import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, TextInput } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type POI } from "@/src/api";
import { useApp } from "@/src/store";
import { SkeletonList } from "@/src/components/Skeleton";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Dish = { id: string; name: string; description: string; image: string; tags?: string[] };
type Tab = "dishes" | "restaurants";

export default function FoodScreen() {
  const { activeCityId, deviceId, progressVersion } = useApp();
  const [food, setFood] = useState<POI[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [tab, setTab] = useState<Tab>("dishes");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tried, setTried] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [cvsMap, setCvsMap] = useState<Record<string, number>>({});

  const loadProgress = async () => {
    if (!deviceId) return;
    try {
      const p = await api.progress(deviceId);
      const ci = new Set<string>();
      (p.check_ins || []).forEach((c: any) => { if (c.poi_id) ci.add(c.poi_id); });
      setVisited(ci);
      const triedList = ((p.quest_progress as any) || {})["__dishes_tried"] || [];
      setTried(new Set(Array.isArray(triedList) ? triedList : []));
    } catch {}
  };
  useEffect(() => { loadProgress(); }, [deviceId, progressVersion]);

  const load = async () => {
    try {
      const [r, d] = await Promise.all([api.food(activeCityId), api.dishes(activeCityId)]);
      setFood(r);
      setDishes(d);
    } catch (e) { console.warn(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { setLoading(true); setQuery(""); load(); }, [activeCityId]);

  // Batch CVS scores for every POI in the city — shown per restaurant card
  // in place of the raw Google star rating (proprietary score only).
  useEffect(() => {
    if (!activeCityId) return;
    api.cvsSummary(activeCityId).then(setCvsMap).catch(() => setCvsMap({}));
  }, [activeCityId, progressVersion]);

  const q = query.trim().toLowerCase();
  const filteredFood = useMemo(
    () => food.filter(f => !q || f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)),
    [food, q]
  );
  const filteredDishes = useMemo(
    () => dishes.filter(d => !q || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)),
    [dishes, q]
  );

  const placeholder = tab === "dishes" ? "Search dishes..." : "Search restaurants...";
  const subtitle = tab === "dishes"
    ? "Local flavors you have to try at least once."
    : "Where locals (and us) actually eat.";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="food-screen">
      <View style={styles.header}>
        <Text style={styles.kicker}>GASTRONOMY</Text>
        <Text style={styles.h1}>Iconic flavors</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* Segmented control */}
        <View style={styles.segWrap} testID="food-segmented">
          <SegButton
            label="Dishes"
            count={dishes.length}
            icon="restaurant"
            active={tab === "dishes"}
            onPress={() => setTab("dishes")}
            testID="seg-dishes"
          />
          <SegButton
            label="Restaurants"
            count={food.length}
            icon="storefront"
            active={tab === "restaurants"}
            onPress={() => setTab("restaurants")}
            testID="seg-restaurants"
          />
        </View>

        <View style={styles.searchBar} testID="food-search">
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable hitSlop={10} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {tab === "dishes" ? (
        <FlatList
          key="dishes-list"
          data={filteredDishes}
          keyExtractor={(d) => d.id}
          renderItem={({ item }) => <DishRow d={item} tried={tried.has(item.id)} />}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            loading ? <SkeletonList />
              : <Text style={styles.empty}>{q ? "No dishes match your search." : "No dishes for this city yet."}</Text>
          }
          ListFooterComponent={
            filteredDishes.length > 0 && food.length > 0 && !q ? (
              <Pressable style={styles.crossLink} onPress={() => setTab("restaurants")} testID="cross-link-restaurants">
                <View>
                  <Text style={styles.crossLinkKicker}>NEXT</Text>
                  <Text style={styles.crossLinkTitle}>Where to taste them →</Text>
                  <Text style={styles.crossLinkSub}>{food.length} curated restaurants</Text>
                </View>
                <Ionicons name="arrow-forward" size={22} color={colors.brand} />
              </Pressable>
            ) : null
          }
        />
      ) : (
        <FlatList
          key="restaurants-list"
          data={filteredFood}
          keyExtractor={(f) => f.id}
          renderItem={({ item }) => <RestaurantCard f={item} visited={visited.has(item.id)} cvs={cvsMap[item.id]} />}
          contentContainerStyle={{ paddingBottom: 120, paddingTop: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            loading ? <SkeletonList />
              : <Text style={styles.empty}>{q ? "No restaurants match your search." : "No restaurants for this city yet."}</Text>
          }
        />
      )}
    </View>
  );
}

function SegButton({
  label, count, icon, active, onPress, testID,
}: {
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.segBtn, active && styles.segBtnActive]} testID={testID}>
      <Ionicons name={icon} size={14} color={active ? colors.surface : colors.onSurfaceTertiary} />
      <Text style={[styles.segLabel, active && styles.segLabelActive]}>{label}</Text>
      <View style={[styles.segCount, active && styles.segCountActive]}>
        <Text style={[styles.segCountText, active && styles.segCountTextActive]}>{count}</Text>
      </View>
    </Pressable>
  );
}

function DishRow({ d, tried }: { d: Dish; tried: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      style={styles.dishRow}
      onPress={() => router.push(`/dish/${d.id}`)}
      testID={`dish-card-${d.id}`}
    >
      <Image source={d.image} style={styles.dishRowImg} contentFit="cover" />
      <View style={styles.dishRowBody}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={styles.dishRowName} numberOfLines={1}>{d.name}</Text>
          {tried && (
            <View style={styles.triedBadge}>
              <Ionicons name="checkmark-circle" size={10} color="#fff" />
              <Text style={styles.triedText}>TRIED</Text>
            </View>
          )}
        </View>
        <Text style={styles.dishRowDesc} numberOfLines={3}>{d.description}</Text>
        <View style={styles.dishRowFoot}>
          <View style={styles.xpBadge}>
            <Ionicons name="flash" size={11} color={colors.brand} />
            <Text style={styles.xpText}>+25 XP for trying</Text>
          </View>
          {!!d.tags?.length && (
            <View style={styles.tagsRow}>
              {d.tags.slice(0, 2).map((t) => (
                <View key={t} style={styles.tagPill}><Text style={styles.tagText}>{t}</Text></View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function RestaurantCard({ f, visited, cvs }: { f: POI; visited: boolean; cvs?: number }) {
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
          {cvs != null && (
            <View style={styles.cvsPill}>
              <Ionicons name="shield-checkmark" size={10} color="#FFF" />
              <Text style={styles.cvsPillVal}>{Math.round(cvs)}</Text>
              <Text style={styles.cvsPillSlash}>/100</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardDesc} numberOfLines={2}>{f.description}</Text>
        <View style={styles.footerRow}>
          <View style={styles.xpBadge}>
            <Ionicons name="flash" size={11} color={colors.brand} />
            <Text style={styles.xpText}>+{f.xp_reward} XP for visiting</Text>
          </View>
          {visited && (
            <View style={styles.triedBadge}>
              <Ionicons name="checkmark-circle" size={10} color="#fff" />
              <Text style={styles.triedText}>VISITED</Text>
            </View>
          )}
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

  // Segmented control
  segWrap: {
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    padding: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  segBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    minHeight: 40,
  },
  segBtnActive: { backgroundColor: colors.brand, ...shadow.pill },
  segLabel: { fontSize: 13, fontWeight: "700", color: colors.onSurfaceTertiary, letterSpacing: 0.3 },
  segLabelActive: { color: colors.surface },
  segCount: {
    paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill,
    backgroundColor: "rgba(0,0,0,0.06)", minWidth: 22, alignItems: "center",
  },
  segCountActive: { backgroundColor: "rgba(255,255,255,0.22)" },
  segCountText: { fontSize: 11, fontWeight: "700", color: colors.onSurfaceTertiary },
  segCountTextActive: { color: colors.surface },

  searchBar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, height: 44 },
  searchInput: { flex: 1, fontSize: 14, color: colors.onSurface },

  // Restaurant card
  card: { marginHorizontal: spacing.lg, flexDirection: "row", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  cardImage: { width: 110, height: 130 },
  cardBody: { flex: 1, padding: spacing.md, justifyContent: "space-between" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginRight: spacing.sm },
  rating: { flexDirection: "row", alignItems: "center", gap: 3 },
  ratingText: { fontSize: 12, color: colors.onSurfaceTertiary, fontWeight: "600" },
  cvsPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.brand, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: radius.pill },
  cvsPillVal: { color: "#FFF", fontWeight: "800", fontSize: 11 },
  cvsPillSlash: { color: "rgba(255,255,255,0.75)", fontWeight: "700", fontSize: 9 },
  cardDesc: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  xpBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FCE9E1", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  xpText: { color: colors.brand, fontWeight: "700", fontSize: 11 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  // Dish row (full-width card in dishes section)
  dishRow: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  dishRowImg: { width: 110, height: 130 },
  dishRowBody: { flex: 1, padding: spacing.md, justifyContent: "center", gap: 4 },
  dishRowName: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface },
  dishRowDesc: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  triedBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#2E8B57", paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill },
  triedText: { color: "#fff", fontWeight: "800", fontSize: 9, letterSpacing: 0.5 },
  dishRowFoot: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  tagPill: { backgroundColor: "#F2EFE8", paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tagText: { fontSize: 10, color: colors.onSurfaceTertiary, fontWeight: "600", letterSpacing: 0.2 },

  // Cross-link
  crossLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "#FCE9E1",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  crossLinkKicker: { fontSize: 10, letterSpacing: 2, fontWeight: "700", color: colors.brand, marginBottom: 2 },
  crossLinkTitle: { fontFamily: fonts.display, fontSize: 17, color: colors.onSurface },
  crossLinkSub: { color: colors.muted, fontSize: 12, marginTop: 2 },

  empty: { textAlign: "center", color: colors.muted, padding: spacing.xl },
});
