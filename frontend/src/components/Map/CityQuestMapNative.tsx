/**
 * CityQuestMap — native MapLibre implementation.
 *
 * Renders a MapTiler-tiled map with our marker components layered on top.
 * Marker positions are placed with `Marker` (React Native views
 * anchored to lng/lat) so the JSX-based markers styles reuse the exact
 * same components as the web fallback would in the future.
 *
 * Performance:
 *   * Clustering is done off-map with `supercluster` — only the visible
 *     bbox is rendered as `Marker`s, capped by an internal ceiling.
 *   * Camera changes are debounced through MapLibre's native throttling.
 *   * All markers are `memo`-wrapped; only their `visited` prop changes.
 *
 * Prepared for future features:
 *   * Offline maps    → `offlineManager.createPack({ styleURL, bounds, ... })`
 *   * Geofencing      → hidden `SymbolLayer` with `circle-radius` from POI.radius
 *   * AR camera       → the ScreenToLng helper on the ref stays usable by AR overlays
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Camera, Map as MLMap, Marker, UserLocation, type CameraRef, type ViewStateChangeEvent } from "@maplibre/maplibre-react-native";
import type { NativeSyntheticEvent } from "react-native";

import { useMapStyleUrl } from "./hooks/useMapStyle";
import { useCluster } from "./hooks/useCluster";
import { useUserLocation } from "./hooks/useUserLocation";
import { CategoryMarker } from "./CategoryMarker";
import { ClusterMarker } from "./ClusterMarker";
import type { CityQuestMapProps, PoiProperties } from "./types";

// MapLibre-RN doesn't need an access token, but the module still asks for one.

const DEFAULT_ZOOM = 13;
const MARKER_CAP = 120; // render at most this many marker views at once

export default function CityQuestMap({
  city, pois, routes = [], onPoiPress, followUser = false, theme = "auto",
}: CityQuestMapProps) {
  const styleURL = useMapStyleUrl(theme);
  const cluster = useCluster(pois);
  // Always active while the map is mounted so we can show the user's
  // position AND drive the "recenter on me" floating button. The hook
  // handles the permission dance gracefully — coords stays null if the
  // user hasn't granted foreground location.
  const { state: locState, coords: userCoords } = useUserLocation(true);
  const locationGranted = locState === "granted" && !!userCoords;

  const cameraRef = useRef<CameraRef>(null);
  const [zoom, setZoom] = useState<number>(city.zoom ?? DEFAULT_ZOOM);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);

  // Kick the camera to the user when "follow me" is on.
  useEffect(() => {
    if (followUser && userCoords && cameraRef.current) {
      cameraRef.current.flyTo({
        center: [userCoords.lng, userCoords.lat],
        zoom: Math.max(14, zoom),
        duration: 900,
      });
    }
  }, [followUser, userCoords, zoom]);

  const onRegionDidChange = useCallback(
    (e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      const vs = e.nativeEvent;
      if (!vs) return;
      if (vs.zoom !== zoom) setZoom(vs.zoom);
      const b = vs.bounds as unknown as { ne: [number, number]; sw: [number, number] } | undefined;
      if (b?.ne && b?.sw) {
        // Normalize to [W, S, E, N] for supercluster.
        setBbox([b.sw[0], b.sw[1], b.ne[0], b.ne[1]]);
      }
    },
    [zoom],
  );

  // Compute clusters/points visible in the current viewport.
  const { clusters, points } = useMemo(() => {
    if (!bbox) return { clusters: [] as any[], points: [] as any[] };
    const nodes = cluster.getClusters(bbox, Math.floor(zoom));
    const out = { clusters: [] as any[], points: [] as any[] };
    for (const n of nodes) {
      if ((n.properties as any).cluster) out.clusters.push(n);
      else out.points.push(n);
      if (out.clusters.length + out.points.length >= MARKER_CAP) break;
    }
    return out;
  }, [cluster, bbox, zoom]);

  const handleClusterPress = useCallback((clusterId: number, lng: number, lat: number) => {
    const expansionZoom = Math.min(cluster.getClusterExpansionZoom(clusterId), 18);
    cameraRef.current?.flyTo({ center: [lng, lat], zoom: expansionZoom, duration: 500 });
  }, [cluster]);

  const handleMarkerPress = useCallback((poi: PoiProperties, lng: number, lat: number) => {
    onPoiPress?.({
      id: poi.id, name: poi.name,
      lat, lng,
      kultur_yolu: poi.kultur_yolu,
      ky_seq: poi.ky_seq ?? null,
      visited: poi.visited,
      category: poi.category,
    });
  }, [onPoiPress]);

  const recenterOnUser = useCallback(() => {
    if (!userCoords || !cameraRef.current) return;
    cameraRef.current.flyTo({ center: [userCoords.lng, userCoords.lat], zoom: 15, duration: 700 });
  }, [userCoords]);

  return (
    <View style={styles.container} testID="cityquest-map-native">
      <MLMap
        style={StyleSheet.absoluteFill}
        mapStyle={styleURL}
        onRegionDidChange={onRegionDidChange}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: [city.lng, city.lat], zoom: city.zoom ?? DEFAULT_ZOOM }}
        />


        {clusters.map((c) => {
          const [lng, lat] = c.geometry.coordinates as [number, number];
          const count = c.properties.point_count as number;
          const kids = cluster.getLeaves(c.id as number, Infinity) as any[];
          const visitedRatio =
            kids.reduce((s, k) => s + (k.properties.visited ? 1 : 0), 0) / Math.max(1, kids.length);
          return (
            <Marker key={`cl-${c.id}`} lngLat={[lng, lat]} anchor="center">
              <Pressable onPress={() => handleClusterPress(c.id as number, lng, lat)}>
                <ClusterMarker count={count} visitedRatio={visitedRatio} />
              </Pressable>
            </Marker>
          );
        })}

        {points.map((p) => {
          const [lng, lat] = p.geometry.coordinates as [number, number];
          const props = p.properties as PoiProperties;
          return (
            <Marker key={`pt-${props.id}`} lngLat={[lng, lat]} anchor="center">
              <Pressable onPress={() => handleMarkerPress(props, lng, lat)} hitSlop={4}>
                <CategoryMarker
                  category={props.category}
                  visited={props.visited}
                  kulturYolu={props.kultur_yolu}
                  kySeq={props.ky_seq ?? null}
                />
              </Pressable>
            </Marker>
          );
        })}

        {/* Native user-location dot + accuracy ring + heading arrow. When
            permission is denied this simply doesn't render — no crash,
            no alert loop (the hook already handled the prompt lifecycle). */}
        {locationGranted && (
          <UserLocation accuracy heading />
        )}
      </MLMap>

      {/* "Recenter on me" floating button. Hidden when we don't have a
          fresh position — no point exposing an action we can't fulfill. */}
      {locationGranted && (
        <Pressable
          onPress={recenterOnUser}
          style={styles.recenterBtn}
          testID="map-recenter-btn"
          hitSlop={8}
        >
          <Ionicons name="locate" size={22} color="#111" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden", backgroundColor: "#DEDBD5" },
  recenterBtn: {
    position: "absolute", bottom: 20, right: 16,
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: "#FFF",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    // Match Android elevation with iOS shadow so the button sits above
    // the map tiles on both platforms.
    shadowColor: "#000", shadowOpacity: 0.2,
    shadowRadius: 5, shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
});
