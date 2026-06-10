import { createContext, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_KEY = "cityquest_device_id";
const CITY_KEY = "cityquest_active_city";
const NAME_KEY = "cityquest_display_name";

export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export async function getActiveCity(): Promise<string> {
  return (await AsyncStorage.getItem(CITY_KEY)) ?? "gaziantep";
}
export async function setActiveCity(id: string) {
  await AsyncStorage.setItem(CITY_KEY, id);
}

export async function getDisplayName(): Promise<string> {
  return (await AsyncStorage.getItem(NAME_KEY)) ?? "Traveler";
}
export async function setDisplayName(name: string) {
  await AsyncStorage.setItem(NAME_KEY, name);
}

// Context for cross-tab city selection
type AppCtx = {
  activeCityId: string;
  setActiveCityId: (id: string) => void;
  deviceId: string;
  refreshProgress: () => void;
  progressVersion: number;
};
export const AppContext = createContext<AppCtx>({
  activeCityId: "gaziantep",
  setActiveCityId: () => {},
  deviceId: "",
  refreshProgress: () => {},
  progressVersion: 0,
});
export const useApp = () => useContext(AppContext);
