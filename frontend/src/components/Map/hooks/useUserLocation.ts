/**
 * Foreground location hook used by the map's "follow user" mode.
 *
 * Follows the CityQuest permission contract:
 *   1. Ask contextually — only when the user opts into "follow me".
 *   2. Handle undetermined / denied / permanent-deny; expose an
 *      `openSettings()` helper so screens can render an actionable CTA.
 *   3. Never block the UI: returns null coords when permission isn't granted.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import * as Location from "expo-location";

export type LocState = "idle" | "requesting" | "granted" | "denied" | "unavailable";

export function useUserLocation(active: boolean) {
  const [state, setState] = useState<LocState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const subRef = useRef<Location.LocationSubscription | null>(null);

  const openSettings = useCallback(() => {
    if (Platform.OS === "ios") Linking.openURL("app-settings:");
    else Linking.openSettings();
  }, []);

  const stop = useCallback(() => {
    subRef.current?.remove();
    subRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setState("requesting");
    const current = await Location.getForegroundPermissionsAsync();
    let status = current.status;
    let canAsk = current.canAskAgain;
    if (status !== "granted") {
      if (!canAsk) {
        setState("denied");
        return;
      }
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
      canAsk = req.canAskAgain;
    }
    if (status !== "granted") {
      setState(canAsk ? "idle" : "denied");
      return;
    }
    try {
      subRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      );
      setState("granted");
    } catch {
      setState("unavailable");
    }
  }, []);

  // Wire to the `active` flag so the parent screen owns the lifecycle.
  useEffect(() => {
    if (active) start();
    else stop();
    return stop;
  }, [active, start, stop]);

  // Re-check on app foreground — the user may have flipped permission in Settings.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && active && state === "denied") start();
    });
    return () => sub.remove();
  }, [active, state, start]);

  return { state, coords, start, stop, openSettings };
}
