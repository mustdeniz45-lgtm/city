import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { api, type Quest, type POI, type CheckInResult } from "@/src/api";
import { useApp, getDisplayName } from "@/src/store";
import { colors, difficultyColor, fonts, radius, shadow, spacing } from "@/src/theme";

type Phase = "intro" | "check-in" | "trivia" | "result";

export default function QuestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { deviceId, refreshProgress } = useApp();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "checking" | "ok" | "denied" | "error">("idle");
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const q = await api.quest(id);
        setQuest(q);
        if (q.poi_ids.length) {
          const all = await api.pois(q.city_id);
          setPois(all.filter(p => q.poi_ids.includes(p.id)));
        }
      } catch (e) { console.warn(e); }
    })();
  }, [id]);

  const doCheckIn = async () => {
    setLocStatus("checking");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocStatus("denied"); return; }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      setLocStatus("ok");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Auto-advance to trivia if exists, else submit
      if (quest?.trivia) setPhase("trivia"); else submit(null);
    } catch (e) {
      console.warn(e); setLocStatus("error");
    }
  };

  const submit = async (answerIdx: number | null) => {
    if (!quest) return;
    setBusy(true);
    try {
      const name = await getDisplayName();
      const r = await api.checkIn({
        device_id: deviceId,
        quest_id: quest.id,
        poi_id: quest.poi_ids[0],
        lat: coords?.lat,
        lng: coords?.lng,
        trivia_answer_index: answerIdx ?? undefined,
        display_name: name,
      });
      setResult(r); setPhase("result");
      if (r.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refreshProgress();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
    } catch (e) { console.warn(e); }
    finally { setBusy(false); }
  };

  if (!quest) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  const diffColor = difficultyColor(quest.difficulty);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="quest-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
        <View style={styles.hero}>
          <Image source={quest.cover_image} style={StyleSheet.absoluteFill} contentFit="cover" />
          <LinearGradient colors={["rgba(28,26,23,0.1)", "rgba(28,26,23,0.85)"]} style={StyleSheet.absoluteFill} />
          <Pressable onPress={() => router.back()} style={styles.backBtn} testID="quest-back">
            <Ionicons name="chevron-back" size={22} color="#FFF" />
          </Pressable>
          <View style={styles.heroBody}>
            <View style={[styles.diffBadge, { backgroundColor: diffColor }]}>
              <Text style={styles.diffText}>{quest.difficulty.toUpperCase()}</Text>
            </View>
            <Text style={styles.heroTitle}>{quest.title}</Text>
            <View style={styles.heroMeta}>
              <Meta icon="flash" text={`+${quest.xp_reward} XP`} />
              <Meta icon="time-outline" text={`${quest.estimated_minutes}m`} />
              {quest.badge_name && <Meta icon="ribbon-outline" text={quest.badge_name} />}
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <Text style={styles.desc}>{quest.description}</Text>

          {pois.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: spacing.xl }]}>VISIT</Text>
              {pois.map(p => (
                <View key={p.id} style={styles.poiRow}>
                  <Image source={p.image} style={styles.poiImg} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.poiName}>{p.name}</Text>
                    <Text style={styles.poiDesc} numberOfLines={2}>{p.description}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {phase === "trivia" && quest.trivia && (
            <View style={styles.triviaCard} testID="trivia-card">
              <Text style={styles.sectionLabel}>TRIVIA</Text>
              <Text style={styles.triviaQ}>{quest.trivia.question}</Text>
              {quest.trivia.options.map((opt, i) => (
                <Pressable
                  key={i}
                  onPress={() => setSelected(i)}
                  style={[styles.triviaOpt, selected === i && styles.triviaOptActive]}
                  testID={`trivia-option-${i}`}
                >
                  <View style={[styles.triviaDot, selected === i && styles.triviaDotActive]}>
                    {selected === i && <Ionicons name="checkmark" size={12} color="#FFF" />}
                  </View>
                  <Text style={[styles.triviaText, selected === i && { fontWeight: "700" }]}>{opt}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {phase === "result" && result && (
            <View style={[styles.resultCard, !result.success && { borderColor: colors.error }]} testID="result-card">
              <View style={[styles.resultIcon, !result.success && { backgroundColor: colors.error }]}>
                <Ionicons name={result.success ? "trophy" : "alert-circle"} size={28} color="#FFF" />
              </View>
              <Text style={styles.resultTitle}>{result.success ? "Quest Complete!" : "Try Again"}</Text>
              <Text style={styles.resultMsg}>{result.message}</Text>
              {result.leveled_up && (
                <View style={styles.levelUp}>
                  <Ionicons name="sparkles" size={14} color="#FFF" />
                  <Text style={styles.levelUpText}>LEVEL UP! Now {result.level_title}</Text>
                </View>
              )}
              {result.badge_unlocked && (
                <View style={styles.badgeUnlock}>
                  <Ionicons name="ribbon" size={14} color={colors.brand} />
                  <Text style={styles.badgeUnlockText}>Badge: {result.badge_unlocked}</Text>
                </View>
              )}
              {result.city_stamped && (
                <View style={styles.stampCelebration} testID="city-stamp-celebration">
                  <View style={styles.stampInkBox}>
                    <Text style={styles.stampInkMain}>PASSPORT STAMPED</Text>
                    <Text style={styles.stampInkSub}>{result.stamped_city_name?.toUpperCase()} · 100%</Text>
                  </View>
                  <Text style={styles.stampCelebText}>
                    You completed every quest in {result.stamped_city_name}. Capture the moment.
                  </Text>
                  <Pressable
                    style={styles.postcardCta}
                    onPress={() => router.replace("/collage")}
                    testID="make-postcard-cta"
                  >
                    <Ionicons name="camera" size={16} color="#FFF" />
                    <Text style={styles.postcardCtaText}>Make a postcard</Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {phase === "intro" && (
          <Pressable
            style={[styles.cta, locStatus === "checking" && { opacity: 0.7 }]}
            onPress={doCheckIn}
            disabled={locStatus === "checking"}
            testID="quest-start-btn"
          >
            <Ionicons name="location" size={18} color="#FFF" />
            <Text style={styles.ctaText}>
              {locStatus === "checking" ? "Getting location..." : "GPS Check-in"}
            </Text>
          </Pressable>
        )}
        {phase === "intro" && locStatus === "denied" && (
          <Pressable
            style={[styles.cta, { backgroundColor: colors.onSurface, marginTop: spacing.sm }]}
            onPress={() => quest.trivia ? setPhase("trivia") : submit(null)}
            testID="quest-skip-gps"
          >
            <Text style={styles.ctaText}>Skip GPS — Continue</Text>
          </Pressable>
        )}
        {phase === "trivia" && (
          <Pressable
            style={[styles.cta, selected === null && { opacity: 0.5 }]}
            disabled={selected === null || busy}
            onPress={() => submit(selected)}
            testID="quest-submit-trivia"
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFF" />
            <Text style={styles.ctaText}>{busy ? "Submitting..." : "Submit answer"}</Text>
          </Pressable>
        )}
        {phase === "result" && (
          <Pressable
            style={[styles.cta, { backgroundColor: result?.success ? colors.success : colors.onSurface }]}
            onPress={() => result?.success ? router.back() : setPhase(quest.trivia ? "trivia" : "intro")}
            testID="quest-result-cta"
          >
            <Text style={styles.ctaText}>{result?.success ? "Done" : "Try again"}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Meta({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={12} color="#FFF" />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { height: 320 },
  backBtn: { position: "absolute", top: spacing.xxxl + spacing.xs, left: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center" },
  heroBody: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg },
  diffBadge: { alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, marginBottom: spacing.sm },
  diffText: { color: "#FFF", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  heroTitle: { fontFamily: fonts.display, color: "#FFF", fontSize: 30, marginBottom: spacing.sm },
  heroMeta: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  metaText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  body: { padding: spacing.lg },
  sectionLabel: { fontSize: 11, letterSpacing: 2, color: colors.brand, fontWeight: "700", marginBottom: spacing.sm },
  desc: { color: colors.onSurfaceTertiary, fontSize: 14, lineHeight: 21 },
  poiRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  poiImg: { width: 64, height: 64, borderRadius: radius.sm },
  poiName: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  poiDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  triviaCard: { marginTop: spacing.xl, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  triviaQ: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  triviaOpt: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  triviaOptActive: { borderColor: colors.brand, backgroundColor: "#FCE9E1" },
  triviaDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  triviaDotActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  triviaText: { flex: 1, fontSize: 14, color: colors.onSurface },
  resultCard: { marginTop: spacing.xl, padding: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 2, borderColor: colors.success, alignItems: "center", ...shadow.card },
  resultIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  resultTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface, marginBottom: 6 },
  resultMsg: { color: colors.muted, textAlign: "center", fontSize: 13, lineHeight: 19 },
  levelUp: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginTop: spacing.md },
  levelUpText: { color: "#FFF", fontWeight: "800", fontSize: 11, letterSpacing: 0.5 },
  badgeUnlock: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  badgeUnlockText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  stampCelebration: { width: "100%", marginTop: spacing.lg, padding: spacing.md, backgroundColor: "rgba(179,57,57,0.08)", borderRadius: radius.md, borderWidth: 1, borderColor: "rgba(179,57,57,0.25)", alignItems: "center" },
  stampInkBox: { borderWidth: 3, borderColor: "#B33939", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 4, transform: [{ rotate: "-4deg" }], marginBottom: spacing.sm },
  stampInkMain: { color: "#B33939", fontFamily: fonts.display, fontWeight: "900", fontSize: 18, letterSpacing: 2.5 },
  stampInkSub: { color: "#B33939", fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginTop: 1, textAlign: "center" },
  stampCelebText: { color: colors.onSurfaceTertiary, fontSize: 12, textAlign: "center", marginBottom: spacing.md, lineHeight: 17 },
  postcardCta: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brand, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  postcardCtaText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: "rgba(249,248,246,0.95)", borderTopWidth: 1, borderTopColor: colors.border },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.pill, ...shadow.card },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
});
