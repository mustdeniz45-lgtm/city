/**
 * CityQuestMap — native MapLibre v11
 */
import { StyleSheet, View, Pressable } from "react-native";
import { Map, Camera, Marker } from "@maplibre/maplibre-react-native";

import { useMapStyleUrl } from "./hooks/useMapStyle";
import type { CityQuestMapProps, MapPOI } from "./types";

const DEFAULT_ZOOM = 13;

export default function CityQuestMap({
  city, pois, onPoiPress, theme = "auto",
}: CityQuestMapProps) {
  const styleURL = useMapStyleUrl(theme);

  return (
    <View style={styles.container}>
      <Map style={StyleSheet.absoluteFill} mapStyle={styleURL}>
        {/* initialViewState: kamera sadece ilk mount'ta konumlanır,
            sonra kullanıcının pan/zoom'u korunur */}
        <Camera
          initialViewState={{
            center: [city.lng, city.lat],
            zoom: city.zoom ?? DEFAULT_ZOOM,
          }}
        />

        {pois.map((p: MapPOI) => {
          if (p.lng == null || p.lat == null) return null;

          return (
            <Marker key={p.id} lngLat={[p.lng, p.lat]}>
              <Pressable
                onPress={() => onPoiPress?.(p)}
                hitSlop={8}
                style={[
                  styles.marker,
                  p.kultur_yolu ? styles.markerKY : null,
                  p.visited ? styles.markerVisited : null,
                ]}
              />
            </Marker>
          );
        })}
      </Map>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  marker: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "#C85A40",
    borderWidth: 2, borderColor: "#FFF",
  },
  markerKY: { backgroundColor: "#7A1F8F" },
  markerVisited: { backgroundColor: "#4D7C5F" },
});