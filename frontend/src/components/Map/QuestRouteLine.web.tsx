/**
 * Web no-op stub for QuestRouteLine. On web the map falls back to the info
 * banner in CityQuestMap.web.tsx, so route rendering has nowhere to draw.
 * Keeping the same export signature lets consumers import it unchanged.
 */
import type { RouteFeature } from "./types";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function QuestRouteLine(_props: { routes: RouteFeature[] }): null {
  return null;
}
