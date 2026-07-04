/**
 * Web fallback — MapLibre RN is a native module and won't bundle on web.
 * We keep the module present so `import` calls don't crash the bundler,
 * then render a friendly banner explaining that the map view requires a
 * development build (Emergent Publish → iOS/Android build).
 *
 * The web preview still shows the rest of the app (Explore, Food, Quest,
 * Profile) — only the map tab renders this banner in the browser.
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CityQuestMapProps } from "./types";

export default function CityQuestMap(_props: CityQuestMapProps) {
  return (
    <View style={styles.wrap} testID="cityquest-map-web-fallback">
      <Ionicons name="map" size={44} color="#C85A40" />
      <Text style={styles.title}>Native map view</Text>
      <Text style={styles.body}>
        {"The interactive map runs on a native MapLibre engine, which isn't available in the web preview. Open the app on your device via a development build to explore Gaziantep in full."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 10, backgroundColor: "#F5F3EE" },
  title: { fontSize: 20, fontWeight: "800", color: "#1A1816" },
  body: { textAlign: "center", color: "#6E6A63", fontSize: 13.5, lineHeight: 20, maxWidth: 340 },
});
