/**
 * MapTiler style URL selector. Auto-switches between light (`streets-v2`) and
 * dark (`streets-v2-dark`) themes based on the system color scheme. Callers
 * can override by passing a fixed `theme` prop.
 *
 * Keeping the key here (never on the client bundle at runtime) is fine
 * because it's a public/publishable key; abuse mitigation is via URL
 * allow-listing in the MapTiler dashboard.
 */
import { useColorScheme } from "react-native";
import { useMemo } from "react";

const KEY = process.env.EXPO_PUBLIC_MAPTILER_KEY;

export type MapTheme = "light" | "dark" | "auto";

export function useMapStyleUrl(theme: MapTheme = "auto"): string {
  const scheme = useColorScheme();
  return useMemo(() => {
    const resolved: "light" | "dark" =
      theme === "auto" ? (scheme === "dark" ? "dark" : "light") : theme;
    // Positron / Streets are equally fine — Streets v2 has better POI icons.
    const styleId = resolved === "dark" ? "streets-v2-dark" : "streets-v2";
    return `https://api.maptiler.com/maps/${styleId}/style.json?key=${KEY ?? ""}`;
  }, [theme, scheme]);
}
