/**
 * Per-place photo storage (anonymous, device-local).
 *
 * Each photo is keyed by POI id and stored as a base64 data URI in AsyncStorage.
 * On native we copy the picked file into the app's document directory so the
 * URI stays valid across app restarts; on web we fall back to the base64 data URI.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const KEY = "cityquest_place_photos_v1";

export type PlacePhoto = {
  id: string;            // photo id (uuid-ish)
  poi_id: string;
  poi_name: string;
  uri: string;           // base64 data URI on web, file:// path on native
  added_at: string;      // ISO
};

async function readAll(): Promise<PlacePhoto[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

async function writeAll(list: PlacePhoto[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Persist a freshly-picked image. Native: copies to documentDirectory. Web: stores data URI inline. */
export async function addPhoto({
  poi_id, poi_name, sourceUri, base64,
}: { poi_id: string; poi_name: string; sourceUri: string; base64?: string | null }): Promise<PlacePhoto> {
  const id = uid();
  let uri = sourceUri;

  if (Platform.OS !== "web") {
    try {
      const dir = `${FileSystem.documentDirectory}cityquest_photos/`;
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      const ext = (sourceUri.split(".").pop() || "jpg").split("?")[0].slice(0, 4) || "jpg";
      const dest = `${dir}${id}.${ext}`;
      await FileSystem.copyAsync({ from: sourceUri, to: dest });
      uri = dest;
    } catch (e) {
      // Fallback to base64 if we can't copy the file
      if (base64) uri = `data:image/jpeg;base64,${base64}`;
    }
  } else if (base64) {
    uri = `data:image/jpeg;base64,${base64}`;
  }

  const item: PlacePhoto = {
    id, poi_id, poi_name, uri,
    added_at: new Date().toISOString(),
  };
  const all = await readAll();
  all.unshift(item);
  await writeAll(all);
  return item;
}

export async function listPhotos(poi_id?: string): Promise<PlacePhoto[]> {
  const all = await readAll();
  return poi_id ? all.filter((p) => p.poi_id === poi_id) : all;
}

export async function removePhoto(id: string): Promise<void> {
  const all = await readAll();
  const target = all.find((x) => x.id === id);
  const next = all.filter((x) => x.id !== id);
  await writeAll(next);
  if (target && Platform.OS !== "web" && target.uri.startsWith("file:")) {
    try { await FileSystem.deleteAsync(target.uri, { idempotent: true }); } catch {}
  }
}

export async function clearAllPhotos(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
