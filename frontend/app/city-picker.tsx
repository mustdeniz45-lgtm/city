import { useEffect, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api, type City } from "@/src/api";
import { useApp } from "@/src/store";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

export default function CityPicker() {
  const router = useRouter();
  const { activeCityId, setActiveCityId } = useApp();
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    api.cities().then(setCities).catch(console.warn);
  }, []);

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
                <View style={styles.flagPill}>
                  <Text style={styles.flagText}>{item.country_code}</Text>
                </View>
                <View style={{ flex: 1 }} />
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardSub}>{item.country} · {item.tagline}</Text>
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
  card: { height: 180, borderRadius: radius.lg, overflow: "hidden", ...shadow.card },
  cardActive: { borderWidth: 3, borderColor: colors.brand },
  cardInner: { flex: 1, padding: spacing.lg, justifyContent: "space-between" },
  flagPill: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.25)", paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  flagText: { color: "#FFF", fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  cardTitle: { fontFamily: fonts.display, color: "#FFF", fontSize: 28 },
  cardSub: { color: "#FFF", opacity: 0.92, fontSize: 13, marginTop: 2 },
  activeMark: { position: "absolute", top: spacing.md, right: spacing.md, width: 28, height: 28, borderRadius: 14, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
});
