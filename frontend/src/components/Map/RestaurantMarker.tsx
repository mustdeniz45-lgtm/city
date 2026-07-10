/**
 * Terracotta food / restaurant pin, with a fork glyph.
 */
import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = { visited?: boolean };

function RestaurantMarkerImpl({ visited }: Props) {
  return (
    <View style={[styles.pin, visited && styles.visited]} testID="map-restaurant-marker">
      <Text style={styles.glyph}>F</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#C85A40", borderWidth: 2, borderColor: "#fff",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  visited: { backgroundColor: "#2E8B57" },
  glyph: { color: "#fff", fontWeight: "800", fontSize: 12 },
});

export const RestaurantMarker = memo(RestaurantMarkerImpl);
