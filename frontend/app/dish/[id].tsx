import { useEffect, useState, useCallback } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { api } from "@/src/api";
import { useApp, getDisplayName } from "@/src/store";
import { colors, fonts, radius, shadow, spacing } from "@/src/theme";

type Dish = { id: string; city_id: string; name: string; description: string; image: string; tags: string[] };

export default function DishDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { deviceId, refreshProgress } = useApp();
  const [dish, setDish] = useState<Dish | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.dish(id).then(setDish).catch(console.warn);
    if (deviceId) {
      api.progress(deviceId).then((p) => {
        const triedList = ((p.quest_progress as any) || {})["__dishes_tried"] || [];
        if (Array.isArray(triedList) && triedList.includes(id)) setTried(true);
      }).catch(() => {});
    }
  }, [id, deviceId]);

  const onMarkTried = useCallback(async () => {
    if (!dish || !deviceId) return;
    setBusy(true);
    try {
      const name = await getDisplayName();
      const res = await api.dishTried({
        device_id: deviceId,
        dish_id: dish.id,
        dish_name: dish.name,
        display_name: name,
      });
      setTried(true);
      refreshProgress();
      try { await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      Alert.alert(
        res.already_tried ? "Already tried" : "Nice! +25 XP",
        res.message,
        [{ text: "OK" }],
      );
    } catch (e: any) {
      Alert.alert("Couldn't update", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }, [dish, deviceId, refreshProgress]);

  if (!dish) {
    return (
      <View style={[styles.container, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="dish-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <Image source={dish.image} style={styles.hero} contentFit="cover" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.75)"]} style={styles.heroGrad} />
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12} testID="dish-back">
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <View style={styles.heroBottom}>
            <Text style={styles.kicker}>SIGNATURE DISH</Text>
            <Text style={styles.title}>{dish.name}</Text>
            {!!dish.tags?.length && (
              <View style={styles.tagsRow}>
                {dish.tags.slice(0, 4).map((t) => (
                  <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
                ))}
              </View>
            )}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.xpBanner}>
            <Ionicons name="flash" size={16} color={colors.brand} />
            <Text style={styles.xpText}>+25 XP for trying this dish</Text>
            {tried && (
              <View style={styles.triedBadge}>
                <Ionicons name="checkmark-circle" size={12} color="#fff" />
                <Text style={styles.triedText}>TRIED</Text>
              </View>
            )}
          </View>

          <Text style={styles.section}>About</Text>
          <Text style={styles.desc}>{dish.description}</Text>

          <Pressable
            onPress={onMarkTried}
            disabled={busy || tried}
            style={[styles.btn, (busy || tried) && styles.btnDisabled]}
            testID="dish-mark-tried"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : tried ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#fff" />
                <Text style={styles.btnText}>You've tried this</Text>
              </>
            ) : (
              <>
                <Ionicons name="restaurant" size={18} color="#fff" />
                <Text style={styles.btnText}>I tried it — claim +25 XP</Text>
              </>
            )}
          </Pressable>

          <Text style={styles.hint}>
            Mark dishes as tried to earn XP for your traveler profile. Each dish counts once.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  heroWrap: { position: "relative", width: "100%", height: 320 },
  hero: { width: "100%", height: "100%" },
  heroGrad: { position: "absolute", left: 0, right: 0, bottom: 0, height: 200 },
  backBtn: { position: "absolute", top: spacing.xxl, left: spacing.md, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  heroBottom: { position: "absolute", left: 0, right: 0, bottom: spacing.lg, paddingHorizontal: spacing.lg },
  kicker: { fontSize: 11, letterSpacing: 2, fontWeight: "700", color: "#FFD8C0", marginBottom: 4 },
  title: { fontFamily: fonts.display, fontSize: 30, color: "#fff" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.18)" },
  tagText: { color: "#fff", fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  xpBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FCE9E1", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  xpText: { color: colors.brand, fontWeight: "700", fontSize: 13.5, flex: 1 },
  triedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#2E8B57", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  triedText: { color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },

  section: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginTop: spacing.sm, marginBottom: 6 },
  desc: { color: colors.onSurface, fontSize: 14, lineHeight: 22 },

  btn: { marginTop: spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.pill, ...shadow.pill, minHeight: 50 },
  btnDisabled: { backgroundColor: "#2E8B57" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 14.5, letterSpacing: 0.3 },
  hint: { textAlign: "center", color: colors.muted, fontSize: 11.5, marginTop: spacing.sm, lineHeight: 16 },
});
