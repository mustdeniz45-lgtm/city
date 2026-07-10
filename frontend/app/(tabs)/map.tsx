/**
 * Map tab — migrated from Leaflet + WebView to native MapLibre.
 *
 * Business logic is unchanged: same POI list, same visited set, same
 * navigation on marker press. Only the rendering layer swapped:
 *   * Before: an HTML srcdoc rendered inside `react-native-webview`.
 *   * After:  `<CityQuestMap>` — a native MapLibre canvas with MarkerViews.
 *
 * On the web preview a friendly fallback is shown (MapLibre RN is a native
 * module; the browser can't run it). Every other tab continues to render.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useApp } from "@/src/store";
import { api, type City, type POI, type Progress } from "@/src/api";
import { colors, fonts, spacing } from "@/src/theme";
import { CityQuestMap, type MapPOI } from "@/src/components/Map";

export default function MapScreen() {
  const { activeCityId, deviceId, progressVersion } = useApp();
  const router = useRouter();
  const [city, setCity] = useState<City | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [visited, setVisited] = useState<Set<string>>(new Set());

  // Load city + places
  useEffect(() => {
    (async () => {
      try {
        const [c, all] = await Promise.all([api.city(activeCityId), api.pois(activeCityId)]);
        setCity(c);
        setPois(all.sort((a, b) => (a.ky_seq ?? 9999) - (b.ky_seq ?? 9999)));
      } catch (e) { console.warn(e); }
    })();
  }, [activeCityId]);

  const loadVisited = useCallback(async () => {
    if (!deviceId) return;
    try {
      const p: Progress = await api.progress(deviceId);
      const ids = new Set<string>();
      (p.check_ins || []).forEach((ci) => { if (ci.poi_id) ids.add(ci.poi_id); });
      setVisited(ids);
    } catch { /* anonymous user with no progress yet */ }
  }, [deviceId]);
  useEffect(() => { loadVisited(); }, [loadVisited, progressVersion]);
  useFocusEffect(useCallback(() => { loadVisited(); }, [loadVisited]));

  // Adapt backend POI shape → MapPOI (thin projection, no business logic here).
  const mapPois = useMemo<MapPOI[]>(
    () => pois.map((p) => ({
      id: p.id, name: p.name, lat: p.lat, lng: p.lng,
      category: p.category, kultur_yolu: p.kultur_yolu, ky_seq: p.ky_seq,
      visited: visited.has(p.id),
    })),
    [pois, visited]
  );

  const onPoiPress = useCallback((poi: MapPOI) => {
    router.push(`/poi/${poi.id}`);
  }, [router]);

  const total = pois.length;
  const done = pois.filter((p) => visited.has(p.id)).length;

  return (
    <View style={styles.container} testID="map-screen">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Explore Map</Text>
          <Text style={styles.subtitle}>
            {city ? city.name : "…"} · {done}/{total} places visited
          </Text>
        </View>
        <View style={styles.hintPill}>
          <Ionicons name="information-circle-outline" size={12} color={colors.muted} />
          <Text style={styles.hintText}>Tap clusters to zoom · pins open details</Text>
        </View>
      </View>

      <View style={styles.mapWrap}>
        {city && (
          <CityQuestMap
            city={{ lat: city.lat, lng: city.lng, zoom: 13 }}
            pois={mapPois}
            onPoiPress={onPoiPress}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: spacing.xxxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: colors.surface, gap: spacing.sm,
  },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.onSurface },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  hintPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.surfaceSecondary, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999, maxWidth: 180,
  },
  hintText: { color: colors.muted, fontSize: 10, fontWeight: "600", flexShrink: 1 },
  mapWrap: { flex: 1, paddingBottom: 78 },
});
