/**
 * WeatherPill — current-conditions pill for the Explore header.
 *
 * Fetches from Open-Meteo (free, no API key) on mount and every 30 minutes.
 * Failure modes fall silently — the pill just doesn't render so the header
 * stays clean.
 *
 * Design goals:
 *   * Zero business-logic coupling — takes `lat/lng` props and does its own
 *     network call. Explore page just drops it into the header.
 *   * Icon + temperature is glanceable enough to fit into a compact pill.
 *   * Auto-adjusts language/units via the `Intl` runtime; we default to
 *     Celsius which matches Turkey (where our primary city lives).
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type WeatherState = {
  temp: number;
  code: number;
  isDay: boolean;
} | null;

// Compact map from Open-Meteo weather codes → (Ionicon, human label).
// Codes: https://open-meteo.com/en/docs (WMO Weather interpretation)
function codeToIconLabel(code: number, isDay: boolean): { icon: any; label: string } {
  if (code === 0) return { icon: isDay ? "sunny" : "moon", label: isDay ? "Clear" : "Clear night" };
  if (code === 1 || code === 2) return { icon: isDay ? "partly-sunny" : "cloudy-night", label: "Partly cloudy" };
  if (code === 3) return { icon: "cloud", label: "Cloudy" };
  if (code === 45 || code === 48) return { icon: "cloud-outline", label: "Foggy" };
  if (code >= 51 && code <= 57) return { icon: "rainy-outline", label: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: "rainy", label: "Rain" };
  if (code >= 71 && code <= 77) return { icon: "snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { icon: "rainy", label: "Showers" };
  if (code === 85 || code === 86) return { icon: "snow", label: "Snow showers" };
  if (code >= 95) return { icon: "thunderstorm", label: "Thunderstorm" };
  return { icon: "cloud-outline", label: "Weather" };
}

type Props = { lat?: number | null; lng?: number | null; onPress?: () => void };

export default function WeatherPill({ lat, lng, onPress }: Props) {
  const [state, setState] = useState<WeatherState>(null);

  const load = useCallback(async () => {
    if (lat == null || lng == null) return;
    try {
      const url = `https://api.open-meteo.com/v1/forecast`
        + `?latitude=${lat}&longitude=${lng}`
        + `&current=temperature_2m,weather_code,is_day`
        + `&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) return;
      const j = await res.json();
      const c = j?.current;
      if (typeof c?.temperature_2m !== "number") return;
      setState({
        temp: Math.round(c.temperature_2m),
        code: c.weather_code ?? 0,
        isDay: c.is_day === 1,
      });
    } catch { /* silent — pill just won't render */ }
  }, [lat, lng]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 30 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  if (!state) return null;
  const { icon, label } = codeToIconLabel(state.code, state.isDay);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${label}, ${state.temp} degrees Celsius`}
      style={styles.pill}
      testID="weather-pill"
    >
      <Ionicons name={icon} size={14} color={colors.onSurface} />
      <Text style={styles.temp}>{state.temp}°</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  temp: { color: colors.onSurface, fontWeight: "800", fontSize: 12 },
});
