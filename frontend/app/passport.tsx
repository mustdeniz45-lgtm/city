import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type PassportEntry, type StampTier } from "@/src/api";
import { useApp } from "@/src/store";
import StampBadge from "@/src/components/StampBadge";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

// Client-side tier order — kept in sync with backend `stamps.py::TIER_ORDER`.
// Not directly used by this file today, but exported for any future
// per-tier styling helpers (e.g. rendering the full ladder).
export const TIER_ORDER: StampTier[] = ["bronze", "silver", "gold", "diamond"];
const CATEGORY_LABEL: Record<string, string> = {
  landmark: "Landmarks",
  museum: "Museums",
  historic: "Historic",
  "must-see": "Nature",
  restaurant: "Restaurants",
};

export default function PassportScreen() {
  const router = useRouter();
  const { deviceId, setActiveCityId } = useApp();
  const [entries, setEntries] = useState<PassportEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) return;
    api.progressPassport(deviceId)
      .then(setEntries)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [deviceId]);

  const stamped = entries.filter((e) => e.tier).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="passport-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="passport-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.kicker}>TRAVEL PASSPORT</Text>
          <Text style={styles.title}>Your stamps</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryLeft}>
          <View style={styles.airplaneCircle}>
            <Ionicons name="ribbon" size={22} color="#FFF" />
          </View>
          <View>
            <Text style={styles.summaryNumLine}>
              <Text style={styles.summaryNum}>{stamped}</Text>
              <Text style={styles.summaryDenom}> / {entries.length || "—"}</Text>
            </Text>
            <Text style={styles.summaryLabel}>cities stamped</Text>
          </View>
        </View>
        <View style={styles.summaryRight}>
          {entries.map((e) => (
            <StampBadge key={e.city_id} tier={e.tier} size="sm" showLabel={false} />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {loading ? (
          <Text style={styles.loadingText}>Loading your passport…</Text>
        ) : entries.length === 0 ? (
          <View style={styles.empty} testID="passport-empty">
            <Ionicons name="map-outline" size={40} color={colors.muted} />
            <Text style={styles.emptyTitle}>No stamps yet</Text>
            <Text style={styles.emptyBody}>
              Check in to places to start earning Bronze, Silver, Gold and
              Diamond stamps for each city.
            </Text>
          </View>
        ) : (
          entries.map((e) => (
            <PassportRow
              key={e.city_id}
              entry={e}
              onPick={(id) => { setActiveCityId(id); router.back(); }}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function PassportRow({ entry, onPick }: { entry: PassportEntry; onPick: (id: string) => void }) {
  const { tier, next_tier, next_tier_needed, check_ins, per_category } = entry;
  // Progress: from earned-tier-threshold → next-tier-threshold.
  // For the very first tier (no earned yet), floor is 0 so the bar fills
  // proportionally from zero to the Bronze requirement.
  const pct = (() => {
    if (!next_tier || !next_tier_needed) return 100;   // Diamond — complete
    const target = next_tier_needed.count;
    return Math.max(0, Math.min(100, Math.round((check_ins / target) * 100)));
  })();

  return (
    <Pressable
      style={[styles.row, tier && styles.rowDone]}
      onPress={() => onPick(entry.city_id)}
      testID={`passport-row-${entry.city_id}`}
    >
      <Image source={entry.hero_image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={tier ? ["rgba(28,26,23,0.25)", "rgba(28,26,23,0.90)"] : ["rgba(28,26,23,0.55)", "rgba(28,26,23,0.95)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.rowInner}>
        <View style={styles.rowTop}>
          <View style={styles.flagPill}>
            <Text style={styles.flagText}>{entry.country_code}</Text>
          </View>
          <StampBadge tier={tier} size="sm" showLabel={false} />
        </View>
        <View>
          <Text style={styles.rowCity}>{entry.name}</Text>
          <Text style={styles.rowCountry}>
            {tier ? `${tierLabel(tier)} · ${check_ins} check-ins` : `${check_ins} check-ins so far`}
          </Text>
        </View>
        <View>
          <View style={styles.rowTrack}>
            <View
              style={[
                styles.rowFill,
                { width: `${pct}%`, backgroundColor: tier ? "#FDE28A" : colors.brandSecondary },
              ]}
            />
          </View>
          <Text style={styles.rowProgress}>
            {next_tier
              ? `→ ${tierLabel(next_tier)}: ${check_ins}/${next_tier_needed!.count} check-ins`
              : "🏆 Diamond — city completed"}
          </Text>
          {/* Per-category chips for the next-tier diversity requirement.
              Compact by design so the row stays touch-friendly. */}
          {next_tier_needed && (
            <View style={styles.catRow}>
              {(next_tier_needed.categories_missing.length > 0
                ? next_tier_needed.categories_missing
                : Object.keys(per_category).filter((k) => per_category[k] > 0).slice(0, 4)
              ).map((c) => {
                const n = per_category[c] ?? 0;
                const missing = next_tier_needed.categories_missing.includes(c);
                return (
                  <View key={c} style={[styles.catPill, missing ? styles.catPillMissing : styles.catPillHave]}>
                    <Text style={styles.catPillText}>
                      {CATEGORY_LABEL[c] || c}: {n}{missing ? "  · needed" : ""}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
      {tier === "diamond" && (
        <View style={styles.stamp} pointerEvents="none">
          <Text style={styles.stampMain}>DIAMOND</Text>
          <Text style={styles.stampSub}>MASTER TRAVELER</Text>
        </View>
      )}
    </Pressable>
  );
}

function tierLabel(t: StampTier): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingTop: spacing.xxxl, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  kicker: { color: colors.brand, fontSize: 10, letterSpacing: 2.5, fontWeight: "800" },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 18, marginTop: 2 },

  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, backgroundColor: colors.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: colors.border },
  summaryLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  airplaneCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  summaryNumLine: { flexDirection: "row", alignItems: "baseline" },
  summaryNum: { fontFamily: fonts.display, fontSize: 28, color: colors.onSurface },
  summaryDenom: { fontFamily: fonts.display, fontSize: 18, color: colors.muted },
  summaryLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginTop: -2 },
  summaryRight: { flexDirection: "row", gap: 6 },

  row: { minHeight: 200, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  rowDone: { borderColor: "#D19A2C", borderWidth: 2 },
  rowInner: { flex: 1, padding: spacing.md, justifyContent: "space-between", gap: spacing.sm },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  flagPill: { backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  flagText: { color: "#FFF", fontWeight: "800", fontSize: 10, letterSpacing: 1.5 },
  rowCity: { fontFamily: fonts.display, color: "#FFF", fontSize: 24 },
  rowCountry: { color: "rgba(255,255,255,0.85)", fontSize: 11, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  rowTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" },
  rowFill: { height: "100%", borderRadius: 3 },
  rowProgress: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "700", marginTop: 5 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  catPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  catPillHave: { backgroundColor: "rgba(255,255,255,0.15)" },
  catPillMissing: { backgroundColor: "rgba(200,90,64,0.5)" },
  catPillText: { color: "#FFF", fontSize: 10, fontWeight: "700", letterSpacing: 0.3 },

  stamp: { position: "absolute", top: "35%", right: 8, transform: [{ rotate: "-10deg" }], paddingHorizontal: 10, paddingVertical: 5, borderWidth: 3, borderColor: "#B58A25", borderRadius: 4, backgroundColor: "rgba(253,226,138,0.15)", alignItems: "center" },
  stampMain: { color: "#FDE28A", fontFamily: fonts.display, fontWeight: "900", fontSize: 18, letterSpacing: 2 },
  stampSub: { color: "#FDE28A", fontSize: 8, letterSpacing: 1.5, fontWeight: "800", marginTop: 1 },

  empty: { alignItems: "center", padding: spacing.xxxl, gap: spacing.md },
  emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  emptyBody: { color: colors.muted, textAlign: "center", fontSize: 13.5, lineHeight: 20, maxWidth: 320 },

  loadingText: { color: colors.muted, textAlign: "center", paddingVertical: spacing.xl },
});
