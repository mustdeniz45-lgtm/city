/**
 * Write-a-Review screen — `/review/[poiId]`.
 *
 * Behaviour:
 *   1. On mount, hits `/api/pois/{id}/reviews/eligibility` — the backend rule is
 *      "must have a valid check-in for THIS poi in the last 24 h". If ineligible
 *      we render a friendly gate with a shortcut back to the POI detail so the
 *      user can check in first.
 *   2. If the POI category is `restaurant`, we show the food-oriented dimensions
 *      (Food · Service · Value · Authenticity). Otherwise we show the culture
 *      set (Exhibition · Information · Authenticity · Accessibility).
 *   3. Each dimension is a 1..5 tap-a-star row; Overall is the same at the top.
 *   4. POST /api/pois/{id}/reviews returns the persisted row + verified badge.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { api, type POI } from "@/src/api";
import { useApp } from "@/src/store";
import { colors, fonts, radius, spacing } from "@/src/theme";

const RESTAURANT_DIMS = [
  { key: "food",         label: "🍽️ Food",         hint: "Taste, quality, freshness" },
  { key: "service",      label: "👨‍🍳 Service",     hint: "Staff attention, speed"    },
  { key: "value",        label: "💰 Value",        hint: "Portion & price"           },
  { key: "authenticity", label: "🌟 Authenticity", hint: "Traditional / local feel"  },
];
const OTHER_DIMS = [
  { key: "exhibition",   label: "🏛️ Exhibition",   hint: "Collection & displays"     },
  { key: "information",  label: "📖 Information",  hint: "Signage, guides, labels"   },
  { key: "authenticity", label: "🌟 Authenticity", hint: "Historical integrity"      },
  { key: "accessibility",label: "🚶 Accessibility",hint: "Layout, ramps, ease-of-use"},
];

export default function ReviewScreen() {
  const router = useRouter();
  const { poiId } = useLocalSearchParams<{ poiId: string }>();
  const { deviceId } = useApp() as any;

  const [poi, setPoi] = useState<POI | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [eligReason, setEligReason] = useState<string | null>(null);
  const [overall, setOverall] = useState(0);
  const [dimVals, setDimVals] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const dims = useMemo(
    () => (poi?.category === "restaurant" ? RESTAURANT_DIMS : OTHER_DIMS),
    [poi],
  );

  useEffect(() => {
    if (!poiId) return;
    (async () => {
      try {
        const [p, elig] = await Promise.all([
          api.poi(poiId),
          deviceId ? api.reviewEligibility(poiId, deviceId) : Promise.resolve({ eligible: false, window_hours: 24, reason: "Sign in first" }),
        ]);
        setPoi(p);
        setEligible(elig.eligible);
        setEligReason(elig.reason);
      } catch (e: any) {
        console.warn("review boot", e);
        setEligible(false);
        setEligReason("Couldn't load — please try again.");
      }
    })();
  }, [poiId, deviceId]);

  const commentTrimmed = comment.trim();
  const commentLen = commentTrimmed.length;
  const COMMENT_MIN = 20;

  const canSubmit =
    eligible === true &&
    overall > 0 &&
    commentLen >= COMMENT_MIN &&
    dims.every((d) => (dimVals[d.key] ?? 0) > 0);

  const onSubmit = async () => {
    if (!canSubmit || !poiId || !deviceId) return;
    setSubmitting(true);
    try {
      await api.submitReview(poiId, {
        device_id: deviceId, overall,
        dimensions: dimVals,
        comment: commentTrimmed,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
      setTimeout(() => router.back(), 1400);
    } catch (e: any) {
      Alert.alert("Couldn't submit", e?.message ?? "Please try again in a moment.");
    } finally { setSubmitting(false); }
  };

  // ─── Render states ──────────────────────────────────────────────────────
  if (eligible === null || !poi) {
    return (
      <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
    );
  }

  if (!eligible) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed" size={44} color={colors.muted} />
        <Text style={styles.gateTitle}>Verified visitors only</Text>
        <Text style={styles.gateBody}>{eligReason ?? "Check-in required within the last 24 h."}</Text>
        <Pressable onPress={() => router.replace(`/poi/${poiId}`)} style={styles.primaryBtn} testID="review-goto-poi">
          <Ionicons name="location" size={16} color="#FFF" />
          <Text style={styles.primaryBtnText}>Go to place & check in</Text>
        </Pressable>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.center}>
        <View style={styles.doneBadge}><Ionicons name="checkmark" size={44} color="#FFF" /></View>
        <Text style={styles.gateTitle}>Thanks for your review!</Text>
        <Text style={styles.gateBody}>Verified · your rating counts toward the CityQuest Verified Score.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.close}><Ionicons name="close" size={22} color={colors.onSurface} /></Pressable>
        <View style={styles.verifiedPill}>
          <Ionicons name="shield-checkmark" size={12} color={colors.success} />
          <Text style={styles.verifiedText}>VERIFIED VISIT</Text>
        </View>
        <Text style={styles.title}>Rate {poi.name}</Text>
        <Text style={styles.sub}>Your rating helps build the CityQuest Verified Score for this place.</Text>

        <StarRow label="⭐ Overall Experience" hint="How was your visit overall?" value={overall} onChange={setOverall} big />
        {dims.map((d) => (
          <StarRow
            key={d.key} label={d.label} hint={d.hint}
            value={dimVals[d.key] ?? 0}
            onChange={(v) => setDimVals((prev) => ({ ...prev, [d.key]: v }))}
          />
        ))}

        <View style={styles.commentHead}>
          <Text style={styles.commentLabel}>Comment · required</Text>
          <Text style={[styles.commentCount, commentLen < COMMENT_MIN && { color: colors.brand }]}>
            {commentLen < COMMENT_MIN
              ? `${COMMENT_MIN - commentLen} more character${COMMENT_MIN - commentLen === 1 ? "" : "s"}`
              : `${commentLen}/1000`}
          </Text>
        </View>
        <TextInput
          style={[
            styles.commentInput,
            commentLen > 0 && commentLen < COMMENT_MIN && { borderColor: colors.brand },
          ]}
          multiline
          value={comment}
          onChangeText={setComment}
          maxLength={1000}
          placeholder="What was memorable? Any tips for other travellers? (min. 20 characters)"
          placeholderTextColor={colors.muted}
          testID="review-comment"
        />

        <Pressable
          onPress={onSubmit}
          disabled={!canSubmit || submitting}
          style={[styles.primaryBtn, (!canSubmit || submitting) && { opacity: 0.5 }]}
          testID="review-submit"
        >
          {submitting ? <ActivityIndicator color="#FFF" /> : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Submit verified review</Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function StarRow({ label, hint, value, onChange, big }: {
  label: string; hint?: string; value: number; onChange: (v: number) => void; big?: boolean;
}) {
  return (
    <View style={[styles.row, big && styles.rowBig]}>
      <Text style={styles.rowLabel}>{label}</Text>
      {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => { Haptics.selectionAsync(); onChange(n); }} hitSlop={4}
            testID={`star-${label.replace(/\s+/g, "-")}-${n}`}>
            <Ionicons
              name={n <= value ? "star" : "star-outline"}
              size={big ? 32 : 26}
              color={n <= value ? colors.brand : colors.muted}
              style={{ marginRight: 4 }}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md, backgroundColor: colors.surface },
  gateTitle: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 20, marginTop: spacing.md },
  gateBody: { color: colors.muted, textAlign: "center", fontSize: 14, paddingHorizontal: spacing.lg },
  doneBadge: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  body: { padding: spacing.lg, paddingTop: spacing.xxl + spacing.lg, gap: spacing.md, backgroundColor: colors.surface, minHeight: "100%" },
  close: { position: "absolute", top: spacing.lg, right: spacing.lg, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", zIndex: 3 },
  verifiedPill: { flexDirection: "row", alignSelf: "flex-start", alignItems: "center", gap: 4, backgroundColor: "rgba(22,163,74,0.12)", paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill },
  verifiedText: { color: colors.success, fontWeight: "800", fontSize: 10, letterSpacing: 1 },
  title: { color: colors.onSurface, fontFamily: fonts.display, fontSize: 24 },
  sub: { color: colors.muted, fontSize: 13, marginTop: -spacing.xs, marginBottom: spacing.md },
  row: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rowBig: { backgroundColor: colors.brandTertiary + "12", borderColor: colors.brand + "44" },
  rowLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  rowHint: { color: colors.muted, fontSize: 11, marginTop: 2 },
  starsRow: { flexDirection: "row", marginTop: spacing.sm },
  commentHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md },
  commentLabel: { color: colors.muted, fontSize: 11, letterSpacing: 1, fontWeight: "800" },
  commentInput: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, minHeight: 100, textAlignVertical: "top", borderWidth: 1, borderColor: colors.border },
  commentCount: { color: colors.muted, fontSize: 11, fontWeight: "700" },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 14, borderRadius: radius.pill, marginTop: spacing.md },
  primaryBtnText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
