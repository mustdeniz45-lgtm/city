import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useApp } from "@/src/store";
import WeatherPill from "@/src/components/WeatherPill";
import { colors, fonts, radius, spacing } from "@/src/theme";
import type { City } from "@/src/api";

type Props = { city: City };
export function CityHeader({ city }: Props) {
  const router = useRouter();
  return (
    <View style={styles.wrap} testID="city-header">
      <Image source={city.hero_image} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(28,26,23,0.05)", "rgba(28,26,23,0.85)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.inner}>
        <View style={styles.topRow}>
          <Text style={styles.kicker}>CITYQUEST</Text>
          <View style={styles.topRight}>
            {/* Daily weather (Open-Meteo, free). Falls silently if network fails. */}
            <WeatherPill lat={city.lat} lng={city.lng} />
            <Pressable
              style={styles.cityPill}
              onPress={() => router.push("/city-picker")}
              testID="city-picker-button"
            >
              <Ionicons name="globe-outline" size={14} color="#FFF" />
              <Text style={styles.cityPillText} numberOfLines={1}>{city.name}</Text>
              <Ionicons name="chevron-down" size={14} color="#FFF" />
            </Pressable>
          </View>
        </View>
        <Text style={styles.title} numberOfLines={1}>{city.name}</Text>
        <Text style={styles.tagline} numberOfLines={2}>{city.tagline}</Text>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Ionicons name="location-outline" size={14} color="#FFF" />
            <Text style={styles.statText}>{city.poi_count} places</Text>
          </View>
          <View style={styles.stat}>
            <Ionicons name="flag-outline" size={14} color="#FFF" />
            <Text style={styles.statText}>{city.quest_count} quests</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function useCityWrapper() { return useApp(); }

const styles = StyleSheet.create({
  wrap: { height: 260, overflow: "hidden" },
  inner: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xxl + spacing.lg, paddingBottom: spacing.lg, justifyContent: "flex-end" },
  topRow: { position: "absolute", top: spacing.xxl + spacing.md, left: spacing.lg, right: spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  kicker: { color: "#FFF", fontSize: 11, letterSpacing: 2, fontWeight: "700", opacity: 0.9 },
  cityPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.35)", borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill, maxWidth: 200 },
  cityPillText: { color: "#FFF", fontWeight: "600", fontSize: 13 },
  title: { fontFamily: fonts.display, color: "#FFF", fontSize: 38, letterSpacing: -0.5 },
  tagline: { color: "#FFF", opacity: 0.92, fontSize: 14, marginTop: spacing.xs, marginBottom: spacing.md },
  statsRow: { flexDirection: "row", gap: spacing.md },
  stat: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.25)", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  statText: { color: "#FFF", fontSize: 12, fontWeight: "600" },
});

// Re-export for screens
export { colors };
