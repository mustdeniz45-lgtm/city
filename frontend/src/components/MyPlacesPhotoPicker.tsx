/**
 * MyPlacesPhotoPicker — modal that lets the user pick photos they've
 * already added while checking in at POIs.
 *
 * Design decisions:
 *  - Feed comes from AsyncStorage (`src/photos.ts::listPhotos()`), so it
 *    works offline. We filter down to photos whose `poi_id` is in the set
 *    of check-in POIs the user has actually visited — that way if a user
 *    somehow removes a check-in, their orphaned photos won't leak into
 *    the picker either.
 *  - Multi-select up to `max` (the postcard's remaining slots).
 *  - Empty states are explicit: "no check-ins yet" vs. "checked in but
 *    no photos yet" — different CTAs.
 */
import { useEffect, useMemo, useState } from "react";
import {
  FlatList, Modal, Pressable, StyleSheet, Text, View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { listPhotos, type PlacePhoto } from "@/src/photos";
import { colors, fonts, radius, spacing } from "@/src/theme";

type Props = {
  visible: boolean;
  max: number;                        // remaining postcard slots
  visitedPoiIds: Set<string>;         // POIs the user has actually checked in to
  onCancel: () => void;
  onConfirm: (uris: string[]) => void;
};

export default function MyPlacesPhotoPicker({
  visible, max, visitedPoiIds, onCancel, onConfirm,
}: Props) {
  const [photos, setPhotos] = useState<PlacePhoto[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Reload every time the modal opens so newly-added POI photos appear.
  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSelected(new Set());
    (async () => {
      try {
        const all = await listPhotos();
        setPhotos(all.filter((p) => visitedPoiIds.has(p.poi_id)));
      } finally { setLoading(false); }
    })();
  }, [visible, visitedPoiIds]);

  // Group by POI so users see "Panorama Museum · 3 photos" style sections.
  const grouped = useMemo(() => {
    const byPoi = new Map<string, { poi_name: string; items: PlacePhoto[] }>();
    photos.forEach((p) => {
      const existing = byPoi.get(p.poi_id);
      if (existing) existing.items.push(p);
      else byPoi.set(p.poi_id, { poi_name: p.poi_name, items: [p] });
    });
    return Array.from(byPoi.entries()).map(([poi_id, g]) => ({ poi_id, ...g }));
  }, [photos]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); }
      else {
        if (next.size >= max) return prev;   // silently ignore excess taps
        next.add(id);
      }
      Haptics.selectionAsync();
      return next;
    });
  };

  const handleConfirm = () => {
    // Preserve tap order → map through `photos` in original order.
    const ordered = photos.filter((p) => selected.has(p.id)).map((p) => p.uri);
    onConfirm(ordered);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onCancel}
      testID="my-places-picker"
    >
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={12} testID="my-places-close">
            <Ionicons name="close" size={26} color={colors.onSurface} />
          </Pressable>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={styles.title}>From places you&apos;ve visited</Text>
            <Text style={styles.subtitle}>
              {selected.size > 0
                ? `${selected.size} of ${max} selected`
                : `Tap to pick up to ${max}`}
            </Text>
          </View>
          <View style={{ width: 26 }} />
        </View>

        {loading ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>Loading your photos…</Text>
          </View>
        ) : grouped.length === 0 ? (
          <View style={styles.state} testID="my-places-empty">
            <Ionicons name="camera-outline" size={40} color={colors.muted} />
            <Text style={styles.stateTitle}>No photos yet</Text>
            <Text style={styles.stateText}>
              {visitedPoiIds.size === 0
                ? "Check in to a place first, then add a photo of it. Your photos will show up here."
                : "Open a place you've visited and tap “Add photo” to snap or upload a memory. It'll appear here for your postcards."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={grouped}
            keyExtractor={(g) => g.poi_id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.section} testID={`my-places-section-${item.poi_id}`}>
                <Text style={styles.sectionTitle} numberOfLines={1}>
                  {item.poi_name}{"  "}
                  <Text style={styles.sectionCount}>· {item.items.length}</Text>
                </Text>
                <View style={styles.grid}>
                  {item.items.map((ph) => {
                    const isSel = selected.has(ph.id);
                    const disabled = !isSel && selected.size >= max;
                    return (
                      <Pressable
                        key={ph.id}
                        onPress={() => toggle(ph.id)}
                        disabled={disabled}
                        style={[styles.thumb, isSel && styles.thumbSel, disabled && { opacity: 0.4 }]}
                        testID={`my-places-thumb-${ph.id}`}
                      >
                        <Image source={ph.uri} style={StyleSheet.absoluteFill} contentFit="cover" />
                        {isSel && (
                          <View style={styles.selBadge}>
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          />
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={onCancel}
            style={[styles.footBtn, styles.footBtnGhost]}
            testID="my-places-cancel"
          >
            <Text style={styles.footBtnGhostText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            disabled={selected.size === 0}
            style={[styles.footBtn, styles.footBtnPrimary, selected.size === 0 && { opacity: 0.5 }]}
            testID="my-places-confirm"
          >
            <Text style={styles.footBtnPrimaryText}>
              {selected.size === 0 ? "Pick photos" : `Add ${selected.size} to postcard`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.display, fontSize: 17, color: colors.onSurface },
  subtitle: { fontSize: 11, color: colors.muted, marginTop: 2 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  stateTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.onSurface },
  stateText: { color: colors.muted, textAlign: "center", fontSize: 13.5, lineHeight: 20, maxWidth: 320 },
  list: { padding: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.onSurface, marginBottom: spacing.sm },
  sectionCount: { color: colors.muted, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  thumb: {
    width: 100, height: 100, borderRadius: radius.md, overflow: "hidden",
    backgroundColor: colors.surfaceSecondary, borderWidth: 2, borderColor: "transparent",
  },
  thumbSel: { borderColor: colors.brand },
  selBadge: {
    position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#FFF",
  },
  footer: {
    flexDirection: "row", gap: spacing.sm, padding: spacing.lg,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface,
  },
  footBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.pill, alignItems: "center", justifyContent: "center",
  },
  footBtnGhost: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  footBtnGhostText: { color: colors.onSurface, fontWeight: "700", fontSize: 14 },
  footBtnPrimary: { backgroundColor: colors.brand },
  footBtnPrimaryText: { color: "#FFF", fontWeight: "800", fontSize: 14 },
});
