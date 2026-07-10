import React from "react";
import type { CityQuestMapProps } from "./types";
import CityQuestMapNative from "./CityQuestMapNative";

// TestFlight ve standalone yapılarda doğrudan MapLibre motorunu yükle
export default function CityQuestMap(props: CityQuestMapProps) {
  return <CityQuestMapNative {...props} />;
}