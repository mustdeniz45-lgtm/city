import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type City, type CityProgress } from "@/src/api";
import { useApp } from "@/src/store";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function CityPicker() {
  const router = useRouter();
  const { activeCityId, setActiveCityId, deviceId } = useApp();
  const [cities, setCities] = useState<City[]>([]);
  const [progress, setProgress] = useState<CityProgress[]>([]);

  useEffect(() => {
    api.cities().then(setCities).catch(console.warn);
    if (deviceId) api.progressByCity(deviceId).then(setProgress).catch(console.warn);
  }, [deviceId]);

  const progByCity = useMemo(() => {
    const m: Record<string, CityProgress> = {};
    progress.forEach((p) => { m[p.city_id] = p; });
    return m;
  }, [progress]);

  const pick = (id: string) => {
    setActiveCityId(id);
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="city-picker-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="city-picker-close">
          <Ionicons name="close" size={26} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Choose a city</Text>
        <View style={{ width: 26 }} />
      </View>
      <FlatList
        data={cities}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, gap: spacing.md }}
        renderItem={({ item }) => {
          const active = item.id === activeCityId;
          const cp = progByCity[item.id];
          return (
            <Pressable
              onPress={() => pick(item.id)}
              style={[styles.card, active && styles.cardActive]}
              testID={`city-option-${item.id}`}
            >
              <Image source={item.hero_image} style={StyleSheet.absoluteFill} contentFit="cover" />
              <LinearGradient
                colors={["rgba(28,26,23,0.15)", "rgba(28,26,23,0.85)"]}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.cardInner}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <View style={styles.flagPill}>
                    <Text style={styles.flagText}>{item.country_code}</Text>
                  </View>
                  {cp && cp.completed && (
                    <View style={styles.stampBadge}>
                      <Ionicons name="checkmark-done" size={12} color="#FFF" />
                      <Text style={styles.stampText}>STAMPED</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }} />
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.country} · {item.tagline}</Text>
                {cp && cp.total_quests > 0 && (
                  <View style={styles.progressWrap}>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${cp.percent}%`, backgroundColor: cp.completed ? colors.success : colors.brandSecondary }]} />
                    </View>
                    <Text style={styles.progressText}>
                      {cp.completed_quests}/{cp.total_quests} quests · {cp.percent}%
                    </Text>
                  </View>
                )}
              </View>
              {active && (
                <View style={styles.activeMark}>
                  <Ionicons name="checkmark" size={14} color="#FFF" />
                </View>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  card: { height: 200, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  cardActive: { borderWidth: 3, borderColor: colors.brand },
  cardInner: { flex: 1, padding: spacing.lg, justifyContent: "space-between" },
  flagPill: { backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  flagText: { color: "#FFF", fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  stampBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.success, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, transform: [{ rotate: "-3deg" }] },
  stampText: { color: "#FFF", fontWeight: "800", fontSize: 10, letterSpacing: 1 },
  cardTitle: { fontFamily: fonts.display, color: "#FFF", fontSize: 28 },
  cardSub: { color: "#FFF", opacity: 0.92, fontSize: 13, marginTop: 2 },
  progressWrap: { marginTop: spacing.sm },
  progressTrack: { height: 6, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { color: "rgba(255,255,255,0.92)", fontSize: 11, fontWeight: "600", marginTop: 4, letterSpacing: 0.3 },
  activeMark: { position: "absolute", top: spacing.md, right: spacing.md, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
