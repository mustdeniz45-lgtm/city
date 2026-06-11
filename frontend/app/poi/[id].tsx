import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, type POI } from "@/src/api";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

const CATEGORY_LABEL: Record<string, string> = {
  landmark: "Landmark",
  museum: "Museum",
  historic: "Historic Site",
  "must-see": "Must See",
  restaurant: "Restaurant",
};

export default function POIDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [poi, setPoi] = useState<POI | null>(null);

  useEffect(() => {
    api.poi(id).then(setPoi).catch(console.warn);
  }, [id]);

  if (!poi) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  const isFood = poi.category === "restaurant";
  const directionsUrl = `https://www.google.com/maps?q=${poi.lat},${poi.lng}`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="poi-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.hero}>
          <Image source={poi.image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(28,26,23,0.1)", "rgba(28,26,23,0.85)"]} style={StyleSheet.absoluteFill} />
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="poi-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.heroBody}>
            <View style={styles.kickerRow}>
              <Text style={styles.kicker}>{CATEGORY_LABEL[poi.category] ?? poi.category.toUpperCase()}</Text>
              {poi.kultur_yolu && (
                <View style={styles.kyPill}>
                  <Ionicons name="footsteps" size={10} color="#FFF" />
                  <Text style={styles.kyPillText}>KÜLTÜR YOLU · #{poi.ky_seq}</Text>
                </View>
              )}
            </View>
            <Text style={styles.title}>{poi.name}</Text>
            {poi.name_tr && poi.name_tr !== poi.name && (
              <Text style={styles.subtitleTR}>{poi.name_tr}</Text>
            )}
            <View style={styles.metaRow}>
              <View style={styles.meta}>
                <Ionicons name="star" size={12} color={colors.brandSecondary} />
                <Text style={styles.metaText}>{poi.rating.toFixed(1)}</Text>
              </View>
              <View style={styles.meta}>
                <Ionicons name="flash" size={12} color="#FFF" />
                <Text style={styles.metaText}>+{poi.xp_reward} XP</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <Text style={styles.desc}>{poi.description}</Text>

          <View style={styles.actions}>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => Linking.openURL(directionsUrl)}
              testID="poi-directions"
            >
              <Ionicons name="navigate" size={16} color="#FFF" />
              <Text style={styles.primaryBtnText}>Get directions</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(poi.name)}`)}
              testID="poi-search"
            >
              <Ionicons name="search" size={16} color={colors.brand} />
              <Text style={styles.secondaryBtnText}>Learn more</Text>
            </Pressable>
          </View>

          <ComingSoon icon="time-outline" title="Opening hours" subtitle="Daily schedule + holiday closures arriving soon." />
          <ComingSoon icon="location-outline" title="Location & access" subtitle="Address, nearest transit, entry fee — coming soon." />
          {isFood ? (
            <ComingSoon icon="restaurant-outline" title="Menu highlights" subtitle="Signature dishes and price range — coming soon." />
          ) : (
            <ComingSoon icon="book-outline" title="Visitor tips" subtitle="Best time to visit, accessibility, photography rules — coming soon." />
          )}

          <View style={styles.coordCard}>
            <Ionicons name="pin" size={14} color={colors.muted} />
            <Text style={styles.coordText}>{poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function ComingSoon({ icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <View style={styles.csCard}>
      <View style={styles.csIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.csTitle}>{title}</Text>
        <Text style={styles.csSub}>{subtitle}</Text>
      </View>
      <Text style={styles.csTag}>SOON</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 320 },
  backBtn: { position: "absolute", top: spacing.xxxl + spacing.xs, left: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg },
  kickerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm, flexWrap: "wrap" },
  kicker: { color: colors.brandSecondary, fontSize: 11, letterSpacing: 2.5, fontWeight: "800" },
  kyPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#7A1F8F", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  kyPillText: { color: "#FFF", fontSize: 9, letterSpacing: 1, fontWeight: "800" },
  title: { fontFamily: fonts.display, color: "#FFF", fontSize: 30, letterSpacing: -0.3 },
  subtitleTR: { color: "rgba(255,255,255,0.92)", fontStyle: "italic", fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  meta: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  metaText: { color: "#FFF", fontSize: 11, fontWeight: "700" },

  body: { padding: spacing.lg },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: colors.brand, fontWeight: "700", marginBottom: spacing.sm },
  desc: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 21 },

  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.pill, ...shadow.pill },
  primaryBtnText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand, backgroundColor: "#FCE9E1" },
  secondaryBtnText: { color: colors.brand, fontWeight: "700", fontSize: 13 },

  csCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  csIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FCE9E1", alignItems: "center", justifyContent: "center" },
  csTitle: { fontWeight: "700", fontSize: 14, color: colors.onSurface },
  csSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  csTag: { fontSize: 9, letterSpacing: 1.5, color: colors.brand, fontWeight: "800", backgroundColor: "#FCE9E1", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },

  coordCard: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.lg, alignSelf: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill },
  coordText: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
});
