/**
 * CityQuest Map barrel export.
 *
 * We intentionally re-export ONLY what the app layer (`app/(tabs)/map.tsx`)
 * consumes — the `<CityQuestMap>` component and its `MapPOI` type.
 *
 * Everything else (`QuestMarker`, `QuestRouteLine`, hooks, etc.) is an
 * implementation detail of `CityQuestMapNative.tsx` and must NEVER be
 * re-exported here. Doing so would drag their `import '@maplibre/…'` calls
 * into module-scope evaluation on Expo Go, crashing with
 * `TurboModuleRegistry.getEnforcing('MLRNCameraModule')` before our
 * Expo-Go-detection code in `CityQuestMap.tsx` ever runs.
 */
export { default as CityQuestMap } from "./CityQuestMap";
export type { MapPOI, RouteCoord, RouteFeature, OnPoiPressed, MarkerKind } from "./types";
