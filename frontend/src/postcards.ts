import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "cityquest_postcards_v1";

export type Postcard = {
  id: string;
  uri: string;         // saved local file:// uri OR base64 data uri
  frame: string;       // "postcard" | "polaroid" | "magazine" | "xp"
  city: string;
  city_id: string;
  caption: string;
  created_at: string;
};

export async function listPostcards(): Promise<Postcard[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try { return JSON.parse(raw) as Postcard[]; } catch { return []; }
}

export async function addPostcard(p: Postcard): Promise<Postcard[]> {
  const cur = await listPostcards();
  const next = [p, ...cur].slice(0, 60);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function removePostcard(id: string): Promise<Postcard[]> {
  const cur = await listPostcards();
  const next = cur.filter((p) => p.id !== id);
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
