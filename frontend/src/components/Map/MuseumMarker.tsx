/**
 * Category-colored museum / landmark / historic pin.
 */
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { MarkerKind } from "./types";

const CAT_COLOR: Record<MarkerKind, string> = {
  quest: "#7A1F8F",
  "kultur-yolu": "#7A1F8F",
  restaurant: "#C85A40",
  museum: "#3B7EA1",
  landmark: "#D9953A",
  historic: "#8E6A3A",
};

const GLYPH: Partial<Record<MarkerKind, string>> = {
  museum: "M", landmark: "★", historic: "H",
};

type Props = { kind: MarkerKind; visited?: boolean };

function MuseumMarkerImpl({ kind, visited }: Props) {
  return (
    <View
      style={[styles.pin, { backgroundColor: CAT_COLOR[kind] || "#5A5A5A" }, visited && styles.visited]}
      testID="map-museum-marker"
    >
      <Text style={styles.glyph}>{GLYPH[kind] || "•"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  visited: { backgroundColor: "#2E8B57" },
  glyph: { color: "#fff", fontWeight: "800", fontSize: 12 },
});

export const MuseumMarker = memo(MuseumMarkerImpl);
