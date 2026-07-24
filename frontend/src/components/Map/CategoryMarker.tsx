/**
 * CategoryMarker — the single, category-aware pin used by the CityQuest
 * MapLibre map.
 *
 * Replaces the earlier per-category marker components (QuestMarker,
 * RestaurantMarker, MuseumMarker) with one presentational unit that:
 *
 *   * Maps `category` → Ionicons icon + brand-tuned background color.
 *   * Overlays a purple Kültür Yolu ring + optional sequence chip when
 *     `kultur_yolu === true`. The KY tag is a **layer on top of** the
 *     category — the category icon is NEVER hidden by the KY treatment.
 *   * Dims to 60 % opacity and stamps a green ✓ badge for visited POIs.
 *   * Falls back to a neutral location pin for unknown categories.
 *
 * All styling is pure JS; no image assets are shipped.
 */
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type CategorySpec = { icon: keyof typeof Ionicons.glyphMap; color: string };

// Category → icon + color mapping. Keep in sync with the backend category
// values (see `/backend/server.py::POI.category` and the migration scripts
// under `/backend/`).
const CATEGORY_SPECS: Record<string, CategorySpec> = {
  landmark:          { icon: "flag",       color: "#C85A40" },
  museum:            { icon: "business",   color: "#7A1F8F" },
  historic:          { icon: "time",       color: "#8B6F47" },
  "must-see":        { icon: "star",       color: "#D4A574" },
  restaurant:        { icon: "restaurant", color: "#4D7C5F" },
  parking:           { icon: "car",        color: "#6B7280" },
  drinking_fountain: { icon: "water",      color: "#3B82F6" },
  public_toilet:     { icon: "body",       color: "#6B7280" },
};

const FALLBACK: CategorySpec = { icon: "location", color: "#6B7280" };

// Kültür Yolu brand color — same purple as the KY route pill used in
// POI headers, so the map treatment reads as "same tag, new surface".
const KY_COLOR = "#7A1F8F";

type Props = {
  category?: string | null;
  visited?: boolean;
  kulturYolu?: boolean;
  kySeq?: number | null;
};

function _CategoryMarker({ category, visited, kulturYolu, kySeq }: Props) {
  const spec = (category && CATEGORY_SPECS[category]) || FALLBACK;
  return (
    <View
      style={[styles.wrap, visited && styles.dim]}
      // The wrapper must not swallow taps — the parent `<Pressable>` owns
      // interaction. We only style here.
      pointerEvents="box-none"
      testID={`map-marker-${category || "unknown"}${kulturYolu ? "-ky" : ""}`}
    >
      {/* Kültür Yolu ring — a slightly-larger purple halo behind the badge
          so the category icon stays fully visible in the foreground. */}
      {kulturYolu && <View style={styles.kyRing} />}

      <View style={[styles.badge, { backgroundColor: spec.color }]}>
        <Ionicons name={spec.icon} size={16} color="#FFF" />
      </View>

      {/* Sequence chip — tiny, high-contrast label for KY-numbered POIs.
          Only shown if the sequence number is a positive integer. */}
      {kulturYolu && typeof kySeq === "number" && kySeq > 0 && (
        <View style={styles.kySeqChip}>
          <Text style={styles.kySeqText}>{kySeq}</Text>
        </View>
      )}

      {/* Visited checkmark — corner badge so the icon remains readable. */}
      {visited && (
        <View style={styles.checkBadge} testID="map-marker-visited">
          <Ionicons name="checkmark" size={10} color="#FFF" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 40, height: 40,
    alignItems: "center", justifyContent: "center",
  },
  dim: { opacity: 0.6 },
  badge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
    // Subtle iOS drop; on Android elevation covers the same.
    shadowColor: "#000", shadowOpacity: 0.25,
    shadowRadius: 3, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  kyRing: {
    position: "absolute",
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 2, borderColor: KY_COLOR,
    backgroundColor: "rgba(122,31,143,0.15)",
  },
  kySeqChip: {
    position: "absolute", bottom: -4, right: -6,
    minWidth: 16, height: 14, paddingHorizontal: 3, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: KY_COLOR, borderWidth: 1, borderColor: "#FFF",
  },
  kySeqText: { color: "#FFF", fontSize: 8, fontWeight: "800", letterSpacing: 0.2 },
  checkBadge: {
    position: "absolute", top: -2, right: -2,
    width: 16, height: 16, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#22C55E", borderWidth: 2, borderColor: "#FFF",
  },
});

export const CategoryMarker = memo(_CategoryMarker);
export default CategoryMarker;
