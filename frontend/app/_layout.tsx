import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AppContext, getActiveCity, getDeviceId, setActiveCity } from "@/src/store";
import { AuthProvider } from "@/src/auth";

// Keep the native splash visible from cold start until icon fonts register.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();
  const [activeCityId, setActiveCityIdState] = useState<string>("gaziantep");
  const [deviceId, setDeviceId] = useState<string>("");
  const [progressVersion, setProgressVersion] = useState(0);

  useEffect(() => {
    (async () => {
      const [c, d] = await Promise.all([getActiveCity(), getDeviceId()]);
      setActiveCityIdState(c);
      setDeviceId(d);
    })();
  }, []);

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  const setActiveCityId = useCallback((id: string) => {
    setActiveCityIdState(id);
    setActiveCity(id);
  }, []);
  const refreshProgress = useCallback(() => setProgressVersion(v => v + 1), []);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <AppContext.Provider value={{ activeCityId, setActiveCityId, deviceId, refreshProgress, progressVersion }}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="quest/[id]" options={{ presentation: "card" }} />
            <Stack.Screen name="poi/[id]" options={{ presentation: "card" }} />
            <Stack.Screen name="city-picker" options={{ presentation: "modal" }} />
            <Stack.Screen name="collage" options={{ presentation: "modal" }} />
            <Stack.Screen name="passport" options={{ presentation: "modal" }} />
            <Stack.Screen name="auth/welcome" options={{ presentation: "modal" }} />
            <Stack.Screen name="auth/sign-in" options={{ presentation: "card" }} />
            <Stack.Screen name="auth/sign-up" options={{ presentation: "card" }} />
          </Stack>
        </AppContext.Provider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
