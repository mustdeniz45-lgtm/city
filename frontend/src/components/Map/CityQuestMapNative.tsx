/**
 * CityQuestMap — native MapLibre implementation.
 *
 * Renders a MapTiler-tiled map with our marker components layered on top.
 * Marker positions are placed with `MarkerView` (React Native views
 * anchored to lng/lat) so the JSX-based markers styles reuse the exact
 * same components as the web fallback would in the future.
 *
 * Performance:
 *   * Clustering is done off-map with `supercluster` — only the visible
 *     bbox is rendered as `MarkerView`s, capped by an internal ceiling.
 *   * Camera changes are debounced through MapLibre's native throttling.
 *   * All markers are `memo`-wrapped; only their `visited` prop changes.
 *
 * Prepared for future features:
 *   * Offline maps    → `offlineManager.createPack({ styleURL, bounds, ... })`
 *   * Geofencing      → hidden `SymbolLayer` with `circle-radius` from POI.radius
 *   * Route nav       → `<QuestRouteLine>` already draws AI-fed polylines
 *   * AR camera       → the ScreenToLng helper on the ref stays usable by AR overlays
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MapLibreGL, { Camera, MapView, MarkerView } from "@maplibre/maplibre-react-native";
import type { CameraRef } from "@maplibre/maplibre-react-native";

import { useMapStyleUrl } from "./hooks/useMapStyle";
import { useCluster } from "./hooks/useCluster";
import { useUserLocation } from "./hooks/useUserLocation";
import { QuestMarker } from "./QuestMarker";
import { RestaurantMarker } from "./RestaurantMarker";
import { MuseumMarker } from "./MuseumMarker";
import { ClusterMarker } from "./ClusterMarker";
import { QuestRouteLine } from "./QuestRouteLine";
import type { CityQuestMapProps, PoiProperties } from "./types";

// MapLibre-RN doesn't need an access token, but the module still asks for one.
MapLibreGL.setAccessToken(null);

const DEFAULT_ZOOM = 13;
const MARKER_CAP = 120; // render at most this many marker views at once

export default function CityQuestMap({
  city, pois, routes = [], onPoiPress, followUser = false, theme = "auto",
}: CityQuestMapProps) {
  const styleURL = useMapStyleUrl(theme);
  const cluster = useCluster(pois);
  const { coords: userCoords } = useUserLocation(followUser);

  const cameraRef = useRef<CameraRef>(null);
  const [zoom, setZoom] = useState<number>(city.zoom ?? DEFAULT_ZOOM);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);

  // Kick the camera to the user when "follow me" is on.
  useEffect(() => {
    if (followUser && userCoords && cameraRef.current) {
      cameraRef.current.setCamera({
        centerCoordinate: [userCoords.lng, userCoords.lat],
        zoomLevel: Math.max(14, zoom),
        animationDuration: 900,
      });
    }
  }, [followUser, userCoords, zoom]);

  const onRegionDidChange = useCallback(
    async (e: { properties: { zoomLevel?: number; visibleBounds?: [number, number][] } }) => {
      const z = e.properties.zoomLevel ?? zoom;
      if (z !== zoom) setZoom(z);
      const vb = e.properties.visibleBounds;
      if (vb && vb.length >= 2) {
        // MapLibre returns [[east, north], [west, south]] — normalize to [W, S, E, N].
        const [ne, sw] = vb;
        setBbox([sw[0], sw[1], ne[0], ne[1]]);
      }
    },
    [zoom]
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
    cameraRef.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: expansionZoom,
      animationDuration: 500,
    });
  }, [cluster]);

  const handleMarkerPress = useCallback((poi: PoiProperties, lng: number, lat: number) => {
    onPoiPress?.({
      id: poi.id, name: poi.name,
      lat, lng,
      kultur_yolu: poi.kind === "kultur-yolu",
      ky_seq: poi.ky_seq ?? null,
      visited: poi.visited,
      category: poi.kind === "kultur-yolu" ? "kultur-yolu" : poi.kind,
    });
  }, [onPoiPress]);

  return (
    <View style={styles.container} testID="cityquest-map-native">
      <MapView
        style={StyleSheet.absoluteFill}
        mapStyle={styleURL}
        logoEnabled={false}
        compassEnabled
        attributionPosition={{ bottom: 8, right: 8 }}
        onRegionDidChange={onRegionDidChange as any}
      >
        <Camera
          ref={cameraRef}
          defaultSettings={{
            centerCoordinate: [city.lng, city.lat],
            zoomLevel: city.zoom ?? DEFAULT_ZOOM,
          }}
          animationMode="easeTo"
        />

        <QuestRouteLine routes={routes} />

        {clusters.map((c) => {
          const [lng, lat] = c.geometry.coordinates as [number, number];
          const count = c.properties.point_count as number;
          const kids = cluster.getLeaves(c.id as number, Infinity) as any[];
          const visitedRatio =
            kids.reduce((s, k) => s + (k.properties.visited ? 1 : 0), 0) / Math.max(1, kids.length);
          return (
            <MarkerView key={`cl-${c.id}`} coordinate={[lng, lat]} anchor={{ x: 0.5, y: 0.5 }}>
              <Pressable onPress={() => handleClusterPress(c.id as number, lng, lat)}>
                <ClusterMarker count={count} visitedRatio={visitedRatio} />
              </Pressable>
            </MarkerView>
          );
        })}

        {points.map((p) => {
          const [lng, lat] = p.geometry.coordinates as [number, number];
          const props = p.properties as PoiProperties;
          return (
            <MarkerView key={`pt-${props.id}`} coordinate={[lng, lat]} anchor={{ x: 0.5, y: 0.5 }}>
              <Pressable onPress={() => handleMarkerPress(props, lng, lat)} hitSlop={4}>
                {renderMarker(props)}
              </Pressable>
            </MarkerView>
          );
        })}

        {userCoords && (
          <MarkerView coordinate={[userCoords.lng, userCoords.lat]} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.userDot} />
          </MarkerView>
        )}
      </MapView>
    </View>
  );
}

function renderMarker(props: PoiProperties) {
  const { kind, visited, ky_seq } = props;
  if (kind === "kultur-yolu" || kind === "quest") return <QuestMarker seq={ky_seq} visited={visited} />;
  if (kind === "restaurant") return <RestaurantMarker visited={visited} />;
  return <MuseumMarker kind={kind} visited={visited} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden", backgroundColor: "#DEDBD5" },
  userDot: {
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: "#2A7CFF", borderWidth: 3, borderColor: "#fff",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
});
