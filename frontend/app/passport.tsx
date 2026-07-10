import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type CityProgress } from "@/src/api";
import { useApp } from "@/src/store";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function PassportScreen() {
  const router = useRouter();
  const { deviceId, setActiveCityId } = useApp();
  const [cities, setCities] = useState<CityProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!deviceId) return;
    api.progressByCity(deviceId)
      .then(setCities)
      .catch(console.warn)
      .finally(() => setLoading(false));
  }, [deviceId]);

  const stamped = cities.filter((c) => c.completed).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="passport-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} testID="passport-back">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.kicker}>TRAVEL PASSPORT</Text>
          <Text style={styles.title}>Your journey</Text>
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryLeft}>
          <View style={styles.airplaneCircle}>
            <Ionicons name="airplane" size={22} color="#FFF" />
          </View>
          <View>
            <Text style={styles.summaryNumLine}>
              <Text style={styles.summaryNum}>{stamped}</Text>
              <Text style={styles.summaryDenom}> / {cities.length || "—"}</Text>
            </Text>
            <Text style={styles.summaryLabel}>cities stamped</Text>
          </View>
        </View>
        <View style={styles.summaryRight}>
          {cities.map((c) => (
            <View
              key={c.city_id}
              style={[styles.summaryDot, c.completed && { backgroundColor: colors.success }]}
            />
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md }}>
        {loading ? (
          <Text style={styles.loadingText}>Loading your passport…</Text>
        ) : (
          cities.map((cp) => <PassportRow key={cp.city_id} cp={cp} onPick={(id) => { setActiveCityId(id); router.back(); }} />)
        )}
      </ScrollView>
    </View>
  );
}

function PassportRow({ cp, onPick }: { cp: CityProgress; onPick: (id: string) => void }) {
  const done = cp.completed;
  const stampedDate = cp.stamped_at
    ? new Date(cp.stamped_at).toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase()
    : "";
  return (
    <Pressable
      style={[styles.row, done && styles.rowDone]}
      onPress={() => onPick(cp.city_id)}
      testID={`passport-row-${cp.city_id}`}
    >
      <Image source={cp.hero_image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={done ? ["rgba(28,26,23,0.25)", "rgba(28,26,23,0.85)"] : ["rgba(28,26,23,0.5)", "rgba(28,26,23,0.92)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.rowInner}>
        <View style={styles.rowTop}>
          <View style={styles.flagPill}>
            <Text style={styles.flagText}>{cp.country_code}</Text>
          </View>
          <Text style={styles.rowAction}>
            {done ? "Open city ›" : `${cp.percent}% · Open ›`}
          </Text>
        </View>
        <View>
          <Text style={styles.rowCity}>{cp.name}</Text>
          <Text style={styles.rowCountry}>{cp.country}</Text>
        </View>
        <View>
          <View style={styles.rowTrack}>
            <View style={[styles.rowFill, { width: `${cp.percent}%`, backgroundColor: done ? colors.success : colors.brandSecondary }]} />
          </View>
          <Text style={styles.rowProgress}>{cp.completed_quests}/{cp.total_quests} quests</Text>
        </View>
      </View>
      {done && (
        <View style={styles.stamp} pointerEvents="none">
          <Text style={styles.stampMain}>VISITED</Text>
          <Text style={styles.stampSub}>{stampedDate}</Text>
        </View>
      )}
    </Pressable>
  );
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
  summaryDot: { width: 11, height: 11, borderRadius: 5.5, backgroundColor: colors.borderStrong },

  row: { height: 140, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border, ...shadow.card },
  rowDone: { borderColor: colors.success, borderWidth: 2 },
  rowInner: { flex: 1, padding: spacing.md, justifyContent: "space-between" },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  flagPill: { backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  flagText: { color: "#FFF", fontWeight: "800", fontSize: 10, letterSpacing: 1.5 },
  rowAction: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  rowCity: { fontFamily: fonts.display, color: "#FFF", fontSize: 24 },
  rowCountry: { color: "rgba(255,255,255,0.85)", fontSize: 11, letterSpacing: 1.5, fontWeight: "700", marginTop: 2 },
  rowTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 2.5, overflow: "hidden" },
  rowFill: { height: "100%", borderRadius: 2.5 },
  rowProgress: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "600", marginTop: 4 },
  stamp: { position: "absolute", top: "30%", right: 6, transform: [{ rotate: "-10deg" }], paddingHorizontal: 10, paddingVertical: 5, borderWidth: 3, borderColor: "#B33939", borderRadius: 4, backgroundColor: "rgba(179,57,57,0.15)", alignItems: "center" },
  stampMain: { color: "#B33939", fontFamily: fonts.display, fontWeight: "900", fontSize: 18, letterSpacing: 2 },
  stampSub: { color: "#B33939", fontSize: 8, letterSpacing: 1.5, fontWeight: "800", marginTop: 1 },

  loadingText: { color: colors.muted, textAlign: "center", paddingVertical: spacing.xl },
});
