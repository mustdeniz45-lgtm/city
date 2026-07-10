/**
 * ReviewsSection — CityQuest Verified Score widget + latest reviews list.
 *
 * Renders on the POI detail screen. Composes three things:
 *   1. A CVS "score card" with the aggregate 0–100 rating, confidence, and
 *      breakdown weights.
 *   2. A gated "Write a review" CTA — enabled when the user has a check-in
 *      for this POI within the last 24 hours (backend rule).
 *   3. Up to `previewCount` most-recent reviews with a "See all N" link.
 *
 * All API failures fail-open (widget just disappears) rather than blocking
 * the rest of the POI detail experience.
 */
import { useEffect, useState, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { api, type CVSResponse, type ReviewRow } from "@/src/api";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Props = {
  poiId: string;
  poiCategory?: string;
  deviceId?: string;
  previewCount?: number;
};

const DIM_META: Record<string, { label: string; icon: any }> = {
  food:          { label: "Food",          icon: "restaurant-outline" },
  service:       { label: "Service",       icon: "sparkles-outline"  },
  value:         { label: "Value",         icon: "pricetag-outline"  },
  authenticity:  { label: "Authenticity",  icon: "star-outline"      },
  exhibition:    { label: "Exhibition",    icon: "images-outline"    },
  information:   { label: "Information",   icon: "information-circle-outline" },
  accessibility: { label: "Accessibility", icon: "walk-outline"      },
};

export default function ReviewsSection({ poiId, poiCategory, deviceId, previewCount = 5 }: Props) {
  const router = useRouter();
  const [cvs, setCvs] = useState<CVSResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null);
  const [eligible, setEligible] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api.cvs(poiId), api.reviews(poiId)]);
      setCvs(c); setReviews(r);
    } catch (e) { console.warn("cvs/reviews load", e); }
    if (deviceId) {
      try {
        const el = await api.reviewEligibility(poiId, deviceId);
        setEligible(el.eligible);
      } catch { setEligible(false); }
    }
  }, [poiId, deviceId]);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!cvs) {
    return null;
  }

  const scoreColor =
    cvs.cvs >= 80 ? colors.success :
    cvs.cvs >= 60 ? colors.brandSecondary : colors.brand;
  const confLabel = cvs.confidence === "high" ? "High confidence"
    : cvs.confidence === "medium" ? "Building confidence"
    : "Not enough reviews yet";

  const dims = cvs.dimensions
    ? Object.entries(cvs.dimensions).filter(([, v]) => v !== null && v !== undefined) as [string, number][]
    : [];

  const previewReviews = (reviews ?? []).slice(0, previewCount);
  const hasMore = (reviews?.length ?? 0) > previewCount;

  return (
    <View style={styles.wrap} testID="cvs-reviews-section">
      {/* Score card */}
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.badgeIcon}><Ionicons name="shield-checkmark" size={16} color={colors.brand} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.headTitle}>CityQuest Verified Score</Text>
            <Text style={styles.headSub}>{confLabel} · {cvs.review_count} review{cvs.review_count === 1 ? "" : "s"}</Text>
          </View>
        </View>

        <View style={styles.scoreRow}>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreVal, { color: scoreColor }]}>{Math.round(cvs.cvs)}</Text>
            <Text style={styles.scoreSlash}>/100</Text>
          </View>
          <View style={styles.breakdown}>
            <BreakdownRow label="CityQuest reviews" value={cvs.cq_score} weight={cvs.breakdown_weights.cityquest} />
            <BreakdownRow label="User trust" value={cvs.user_trust_score} weight={cvs.breakdown_weights.trust} />
            <BreakdownRow label="Google rating" value={cvs.google_score} weight={cvs.breakdown_weights.google} />
          </View>
        </View>

        {dims.length > 0 && (
          <View style={styles.dimsRow}>
            {dims.map(([k, v]) => (
              <View key={k} style={styles.dimPill}>
                <Ionicons name={DIM_META[k]?.icon ?? "ellipse-outline"} size={11} color={colors.brand} />
                <Text style={styles.dimPillLabel}>{DIM_META[k]?.label ?? k}</Text>
                <Text style={styles.dimPillVal}>{Number(v).toFixed(1)}</Text>
              </View>
            ))}
          </View>
        )}

        <Pressable
          onPress={() => router.push(`/review/${poiId}`)}
          style={[styles.writeBtn, eligible === false && styles.writeBtnGated]}
          testID="write-review-btn"
        >
          <Ionicons
            name={eligible ? "create" : "lock-closed"}
            size={14}
            color={eligible ? "#FFF" : colors.brand}
          />
          <Text style={[styles.writeBtnText, eligible === false && { color: colors.brand }]}>
            {eligible === null
              ? "Write a verified review"
              : eligible
                ? "Write a verified review"
                : "Check in first to write a review"}
          </Text>
        </Pressable>
      </View>

      {/* Latest reviews */}
      {previewReviews.length > 0 && (
        <View style={styles.reviewsBlock}>
          <View style={styles.reviewsHead}>
            <Text style={styles.reviewsHeadTitle}>Recent reviews</Text>
            {hasMore && (
              <Pressable
                onPress={() => router.push(`/reviews/${poiId}`)}
                hitSlop={10}
                testID="see-all-reviews"
              >
                <Text style={styles.seeAll}>See all {reviews!.length} →</Text>
              </Pressable>
            )}
          </View>
          {previewReviews.map((r) => <ReviewItem key={r.id} r={r} />)}
        </View>
      )}
    </View>
  );
}

function BreakdownRow({ label, value, weight }: { label: string; value: number | null; weight: number }) {
  return (
    <View style={styles.bdRow}>
      <Text style={styles.bdLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.bdBar}>
        <View style={[styles.bdFill, { width: `${Math.min(100, ((value ?? 0) / 100) * 100)}%` }]} />
      </View>
      <Text style={styles.bdVal}>{value !== null ? Math.round(value) : "—"}</Text>
      <Text style={styles.bdWeight}>×{weight.toFixed(2)}</Text>
    </View>
  );
}

export function ReviewItem({ r }: { r: ReviewRow }) {
  const dims = Object.entries(r.dimensions || {}).slice(0, 4) as [string, number][];
  const initials = (r.author?.display_name || "•").slice(0, 1).toUpperCase();
  const when = new Date(r.created_at);
  const days = Math.floor((Date.now() - when.getTime()) / 86400000);
  const ago = days < 1 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days}d ago` : when.toLocaleDateString();

  return (
    <View style={styles.reviewCard} testID={`review-${r.id}`}>
      <View style={styles.reviewHead}>
        {r.author?.avatar_uri ? (
          <Image source={r.author.avatar_uri} style={styles.reviewAvatar} contentFit="cover" />
        ) : (
          <View style={[styles.reviewAvatar, styles.reviewAvatarFallback]}>
            <Text style={styles.reviewAvatarInit}>{initials}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.reviewNameRow}>
            <Text style={styles.reviewName} numberOfLines={1}>{r.author?.display_name || "Traveller"}</Text>
            {r.verified && (
              <View style={styles.verifiedTag}>
                <Ionicons name="shield-checkmark" size={9} color={colors.success} />
                <Text style={styles.verifiedTagText}>VERIFIED</Text>
              </View>
            )}
          </View>
          <Text style={styles.reviewMeta}>
            {r.author?.title ? `${r.author.title} · ` : ""}{ago}
          </Text>
        </View>
        <View style={styles.reviewOverall}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Ionicons key={n} name={n <= r.overall ? "star" : "star-outline"}
              size={11} color={n <= r.overall ? colors.brandSecondary : colors.muted} style={{ marginLeft: 1 }} />
          ))}
        </View>
      </View>

      {!!r.comment && <Text style={styles.reviewText}>{r.comment}</Text>}

      {dims.length > 0 && (
        <View style={styles.reviewDims}>
          {dims.map(([k, v]) => (
            <View key={k} style={styles.reviewDim}>
              <Text style={styles.reviewDimLabel}>{DIM_META[k]?.label ?? k}</Text>
              <Text style={styles.reviewDimVal}>{v}/5</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.lg, gap: spacing.md },

  card: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.md },
  badgeIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#FCE9E1", alignItems: "center", justifyContent: "center" },
  headTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.onSurface },
  headSub: { color: colors.muted, fontSize: 11.5, marginTop: 2 },

  scoreRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  scoreCircle: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF" },
  scoreVal: { fontSize: 30, fontWeight: "800", letterSpacing: -0.5 },
  scoreSlash: { fontSize: 10, color: colors.muted, marginTop: -2 },
  breakdown: { flex: 1, gap: 4 },
  bdRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  bdLabel: { flex: 1, fontSize: 11, color: colors.muted, fontWeight: "600" },
  bdBar: { width: 60, height: 5, borderRadius: 3, backgroundColor: "#E7E1DA", overflow: "hidden" },
  bdFill: { height: "100%", backgroundColor: colors.brand },
  bdVal: { width: 24, textAlign: "right", fontSize: 11, fontWeight: "800", color: colors.onSurface },
  bdWeight: { width: 30, textAlign: "right", fontSize: 10, color: colors.muted, fontWeight: "600" },

  dimsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.md },
  dimPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FCE9E1", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  dimPillLabel: { color: colors.brand, fontWeight: "700", fontSize: 11 },
  dimPillVal: { color: colors.brand, fontWeight: "800", fontSize: 11, marginLeft: 2 },

  writeBtn: { marginTop: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.brand, paddingVertical: 12, borderRadius: radius.pill },
  writeBtnGated: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.brand },
  writeBtnText: { color: "#FFF", fontWeight: "800", fontSize: 13, letterSpacing: 0.3 },

  reviewsBlock: { gap: spacing.sm },
  reviewsHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  reviewsHeadTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.onSurface },
  seeAll: { color: colors.brand, fontWeight: "800", fontSize: 12.5 },

  reviewCard: { backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  reviewHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18 },
  reviewAvatarFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  reviewAvatarInit: { color: "#FFF", fontWeight: "800", fontSize: 14 },
  reviewNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reviewName: { color: colors.onSurface, fontWeight: "800", fontSize: 13, flexShrink: 1 },
  verifiedTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(77,124,95,0.14)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.pill },
  verifiedTagText: { color: colors.success, fontWeight: "800", fontSize: 8, letterSpacing: 0.6 },
  reviewMeta: { color: colors.muted, fontSize: 11, marginTop: 2 },
  reviewOverall: { flexDirection: "row" },
  reviewText: { color: colors.onSurface, fontSize: 13.5, lineHeight: 19 },
  reviewDims: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reviewDim: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  reviewDimLabel: { color: colors.muted, fontSize: 10.5, fontWeight: "600" },
  reviewDimVal: { color: colors.onSurface, fontWeight: "800", fontSize: 10.5 },
});
