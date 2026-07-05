/**
 * CityQuestMap — native dispatcher.
 *
 * Two runtime environments to handle on native:
 *   1) **Expo Go** — the sandboxed client app used by users who scan our
 *      QR code. It ships with a fixed set of native modules; MapLibre RN
 *      is NOT one of them, so `require('@maplibre/maplibre-react-native')`
 *      crashes with `TurboModuleRegistry.getEnforcing('MLRNCameraModule')`
 *      before our JS ever runs.
 *   2) **Development / Production Build** (EAS build, TestFlight, App
 *      Store, Play Store) — the MapLibre native module IS linked, so we
 *      can load the real map.
 *
 * Web is handled by the sibling `CityQuestMap.web.tsx`; Metro prefers
 * `.web.tsx` on web builds, so this file is only reached on iOS/Android.
 *
 * Implementation notes:
 *   * We must NOT `import` the native map at module scope — the mere ESM
 *     import evaluates `@maplibre/maplibre-react-native`'s top-level
 *     `TurboModuleRegistry.getEnforcing(...)` which throws in Expo Go.
 *   * `require()` inside the runtime branch keeps the native module out
 *     of the Expo Go path entirely.
 */
import React from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type { CityQuestMapProps } from "./types";

// `ExecutionEnvironment.StoreClient` is Expo Go. `Bare` = a custom dev/prod
// build (EAS build, standalone binary, etc.). `Standalone` = classic
// standalone (deprecated but still tolerated).
const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Eagerly resolve the native module only when we're NOT in Expo Go — this
// keeps the crash from `TurboModuleRegistry.getEnforcing` at bay.
let NativeMap: React.ComponentType<CityQuestMapProps> | null = null;
if (!IS_EXPO_GO) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NativeMap = require("./CityQuestMapNative").default as React.ComponentType<CityQuestMapProps>;
  } catch (e) {
    // If the native module is missing for any other reason (e.g. a
    // half-baked local build), fall through to the placeholder instead of
    // hard-crashing the tab.
    console.warn("[CityQuestMap] native impl unavailable →", e);
  }
}

export default function CityQuestMap(props: CityQuestMapProps) {
  if (NativeMap) return <NativeMap {...props} />;
  return <ExpoGoFallback />;
}

function ExpoGoFallback() {
  return (
    <View style={styles.wrap} testID="cityquest-map-expo-go-fallback">
      <Ionicons name="map" size={48} color="#C85A40" />
      <Text style={styles.title}>Map preview unavailable</Text>
      <Text style={styles.body}>
        {"The map uses a native engine (MapLibre) that isn't bundled with Expo Go. To explore the interactive map, please open this app in a development or production build."}
      </Text>
      <Pressable
        onPress={() => Linking.openURL("https://docs.expo.dev/develop/development-builds/introduction/")}
        style={styles.cta}
        testID="cityquest-map-help-link"
      >
        <Text style={styles.ctaText}>{Platform.OS === "ios" ? "Learn about dev builds" : "Learn more"}</Text>
        <Ionicons name="open-outline" size={14} color="#FFF" />
      </Pressable>
      <Text style={styles.tinyNote}>Other tabs (Explore, Quests, Food, Profile) work normally in Expo Go.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: 24, gap: 10, backgroundColor: "#F5F3EE",
  },
  title: { fontSize: 20, fontWeight: "800", color: "#1A1816", marginTop: 6 },
  body: { textAlign: "center", color: "#6E6A63", fontSize: 13.5, lineHeight: 20, maxWidth: 340 },
  cta: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#C85A40", paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 999, marginTop: 4,
  },
  ctaText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  tinyNote: { color: "#8B8880", fontSize: 11, marginTop: 8, textAlign: "center" },
});
