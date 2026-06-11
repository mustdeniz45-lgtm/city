import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { api, type Quest, type POI, type CheckInResult } from "@/src/api";
import { useApp, getDisplayName } from "@/src/store";
import { colors, difficultyColor, fonts, radius, shadow, spacing } from "@/src/theme";

type Phase = "checklist" | "trivia" | "result";

const CHECKIN_RADIUS_M = 150;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m away`;
  if (m < 10000) return `${(m / 1000).toFixed(1)} km away`;
  return `${Math.round(m / 1000)} km away`;
}

export default function QuestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { deviceId, refreshProgress } = useApp();
  const [quest, setQuest] = useState<Quest | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("checklist");
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [activePoiId, setActivePoiId] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);

  // Read (but don't request) current GPS — if already granted, fetch a single fix
  // so each POI card can show a live "~XX m away" badge.
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch (e) { console.warn("loc", e); }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const q = await api.quest(id);
        setQuest(q);
        if (q.poi_ids.length) {
          const all = await api.pois(q.city_id);
          const ordered = q.poi_ids
            .map((pid) => all.find((x) => x.id === pid))
            .filter((x): x is POI => Boolean(x));
          setPois(ordered);
        }
        if (deviceId) {
          const prog = await api.progress(deviceId);
          if (prog.completed_quests.includes(id)) {
            setVisited(q.poi_ids);
            setPhase("checklist");
          } else {
            const v = prog.quest_progress?.[id]?.visited ?? [];
            setVisited(v);
            if (q.poi_ids.length > 0 && v.length === q.poi_ids.length && q.trivia) {
              setPhase("trivia");
            }
          }
        }
      } catch (e) { console.warn(e); }
    })();
  }, [id, deviceId]);

  const alreadyCompleted = useMemo(
    () => Boolean(quest && visited.length === quest.poi_ids.length && phase === "checklist" && result === null && visited.length > 0 && !quest.trivia)
      // We will primarily detect completion via server response on submit.
      ,
    [quest, visited, phase, result],
  );
  // Reuse a more reliable signal: if server progress had it completed, we set phase="checklist" but no result.
  // We'll show a "Completed" banner if visited == all and quest is in completed_quests; computed via questCompletedLocally.

  const checkInPoi = async (poiId: string) => {
    if (!quest) return;
    setBusy(true);
    setActivePoiId(poiId);
    try {
      let coords: { lat: number; lng: number } | null = null;
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      let ok = status === "granted";
      if (!ok && canAskAgain) {
        const r = await Location.requestForegroundPermissionsAsync();
        ok = r.status === "granted";
      }
      if (ok) {
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        } catch (e) { console.warn("loc", e); }
      }
      const name = await getDisplayName();
      const r = await api.checkIn({
        device_id: deviceId,
        quest_id: quest.id,
        poi_id: poiId,
        lat: coords?.lat,
        lng: coords?.lng,
        display_name: name,
      });
      if (r.too_far) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert("Too far away", r.message, [{ text: "Got it" }]);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisited(r.visited_pois ?? visited);
      if (r.quest_completed) {
        setResult(r);
        setPhase("result");
        refreshProgress();
      } else if (r.awaiting_trivia && quest.trivia) {
        setPhase("trivia");
      }
    } catch (e) { console.warn(e); }
    finally { setBusy(false); setActivePoiId(null); }
  };

  const submitTrivia = async () => {
    if (!quest || selected === null) return;
    setBusy(true);
    try {
      const name = await getDisplayName();
      const r = await api.checkIn({
        device_id: deviceId,
        quest_id: quest.id,
        trivia_answer_index: selected,
        display_name: name,
      });
      if (r.success && r.quest_completed) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setResult(r);
        setPhase("result");
        refreshProgress();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setResult(r);
      }
    } catch (e) { console.warn(e); }
    finally { setBusy(false); }
  };

  if (!quest) return <View style={{ flex: 1, backgroundColor: colors.surface }} />;

  const diffColor = difficultyColor(quest.difficulty);
  const total = quest.poi_ids.length;
  const done = visited.length;
  const allVisited = total > 0 && done >= total;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="quest-detail">
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
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

          {total > 0 && (
            <View style={styles.progressBar}>
              <View style={styles.progressHead}>
                <Text style={styles.sectionLabel}>{total > 1 ? "VISIT — ALL LOCATIONS" : "VISIT"}</Text>
                <Text style={styles.progressCount}>{done}/{total} done</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(done / Math.max(total, 1)) * 100}%`, backgroundColor: allVisited ? colors.success : diffColor }]} />
              </View>
            </View>
          )}

          {pois.map((p, idx) => {
            const isVisited = visited.includes(p.id);
            const isLoading = busy && activePoiId === p.id;
            const distance = userLoc ? haversineMeters(userLoc, { lat: p.lat, lng: p.lng }) : null;
            const inRange = distance !== null && distance <= CHECKIN_RADIUS_M;
            return (
              <View
                key={p.id}
                style={[styles.poiRow, isVisited && styles.poiRowDone]}
                testID={`poi-row-${p.id}`}
              >
                <View style={styles.poiHead}>
                  <View style={[styles.poiBadge, isVisited && styles.poiBadgeDone]}>
                    {isVisited ? (
                      <Ionicons name="checkmark" size={14} color="#FFF" />
                    ) : (
                      <Text style={styles.poiBadgeText}>{idx + 1}</Text>
                    )}
                  </View>
                  <Image source={p.image} style={styles.poiImg} contentFit="cover" />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.poiName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.poiDesc} numberOfLines={2}>{p.description}</Text>
                    {distance !== null && !isVisited && (
                      <View
                        style={[
                          styles.distancePill,
                          inRange ? styles.distancePillIn : styles.distancePillOut,
                        ]}
                        testID={`poi-distance-${p.id}`}
                      >
                        <Ionicons
                          name={inRange ? "location" : "walk-outline"}
                          size={10}
                          color={inRange ? colors.success : colors.brand}
                        />
                        <Text style={[styles.distanceText, inRange && { color: colors.success }]}>
                          {inRange ? `${Math.round(distance)} m · in range` : formatDistance(distance)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                {isVisited ? (
                  <View style={styles.visitedPill} testID={`poi-visited-${p.id}`}>
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                    <Text style={styles.visitedText}>Visited</Text>
                  </View>
                ) : (
                  <View style={styles.poiActions}>
                    <Pressable
                      style={styles.openMapBtn}
                      onPress={() => Linking.openURL(`https://www.google.com/maps?q=${p.lat},${p.lng}`)}
                      testID={`poi-map-${p.id}`}
                    >
                      <Ionicons name="map-outline" size={14} color={colors.brand} />
                      <Text style={styles.openMapText}>Directions</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.checkBtn, isLoading && { opacity: 0.6 }]}
                      onPress={() => checkInPoi(p.id)}
                      disabled={busy}
                      testID={`poi-checkin-${p.id}`}
                    >
                      <Ionicons name="location" size={14} color="#FFF" />
                      <Text style={styles.checkBtnText}>{isLoading ? "Checking in..." : "Check in here"}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })}

          {phase === "trivia" && quest.trivia && (
            <View style={styles.triviaCard} testID="trivia-card">
              <View style={styles.triviaHead}>
                <Ionicons name="bulb" size={16} color={colors.brand} />
                <Text style={styles.sectionLabel}>FINAL TRIVIA</Text>
              </View>
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
              {result && !result.success && result.message && (
                <Text style={styles.triviaError}>{result.message}</Text>
              )}
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
        {phase === "trivia" && (
          <Pressable
            style={[styles.cta, (selected === null || busy) && { opacity: 0.5 }]}
            disabled={selected === null || busy}
            onPress={submitTrivia}
            testID="quest-submit-trivia"
          >
            <Ionicons name="checkmark-circle" size={18} color="#FFF" />
            <Text style={styles.ctaText}>{busy ? "Submitting..." : "Submit answer"}</Text>
          </Pressable>
        )}
        {phase === "result" && result?.success && (
          <Pressable
            style={[styles.cta, { backgroundColor: colors.success }]}
            onPress={() => router.back()}
            testID="quest-result-cta"
          >
            <Text style={styles.ctaText}>Done</Text>
          </Pressable>
        )}
        {phase === "checklist" && !allVisited && total > 0 && (
          <View style={styles.footerHint} testID="footer-hint">
            <Ionicons name="information-circle-outline" size={14} color={colors.muted} />
            <Text style={styles.footerHintText}>
              {`Check in at all ${total} location${total > 1 ? "s" : ""} to unlock the ${quest.trivia ? "final trivia" : "quest reward"}.`}
            </Text>
          </View>
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

  progressBar: { marginTop: spacing.xl, marginBottom: spacing.sm },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressCount: { fontSize: 12, fontWeight: "700", color: colors.onSurfaceTertiary, marginBottom: spacing.sm },
  progressTrack: { height: 6, backgroundColor: colors.surfaceTertiary, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },

  poiRow: { marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.pill },
  poiRowDone: { borderColor: colors.success, backgroundColor: "#F2F6F2" },
  poiHead: { flexDirection: "row", alignItems: "center" },
  poiBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  poiBadgeDone: { backgroundColor: colors.success },
  poiBadgeText: { fontFamily: fonts.display, color: colors.onSurfaceTertiary, fontSize: 12, fontWeight: "800" },
  poiImg: { width: 56, height: 56, borderRadius: radius.sm },
  poiName: { fontWeight: "700", color: colors.onSurface, fontSize: 14 },
  poiDesc: { color: colors.muted, fontSize: 12, marginTop: 2 },
  poiActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  openMapBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brand, backgroundColor: "#FCE9E1" },
  openMapText: { color: colors.brand, fontWeight: "700", fontSize: 12 },
  checkBtn: { flex: 1.4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.brand },
  checkBtnText: { color: "#FFF", fontWeight: "700", fontSize: 12 },
  visitedPill: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: "rgba(77,124,95,0.12)" },
  visitedText: { color: colors.success, fontWeight: "700", fontSize: 11, letterSpacing: 0.3 },
  distancePill: { flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  distancePillIn: { backgroundColor: "rgba(77,124,95,0.12)", borderColor: "rgba(77,124,95,0.35)" },
  distancePillOut: { backgroundColor: "#FCE9E1", borderColor: "rgba(200,90,64,0.35)" },
  distanceText: { color: colors.brand, fontSize: 10, fontWeight: "700", letterSpacing: 0.2 },

  triviaCard: { marginTop: spacing.xl, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, ...shadow.card },
  triviaHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  triviaQ: { fontFamily: fonts.display, fontSize: 18, color: colors.onSurface, marginBottom: spacing.md },
  triviaOpt: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  triviaOptActive: { borderColor: colors.brand, backgroundColor: "#FCE9E1" },
  triviaDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  triviaDotActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  triviaText: { flex: 1, fontSize: 14, color: colors.onSurface },
  triviaError: { color: colors.error, fontSize: 12, marginTop: 4, fontWeight: "600" },

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

  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, backgroundColor: "rgba(249,248,246,0.96)", borderTopWidth: 1, borderTopColor: colors.border },
  footerHint: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md },
  footerHintText: { color: colors.muted, fontSize: 11, flex: 1 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brand, paddingVertical: spacing.md, borderRadius: radius.pill, ...shadow.card },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: 15, letterSpacing: 0.3 },
});
