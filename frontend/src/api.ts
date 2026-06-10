const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

async function jget<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}
async function jpost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

export type City = {
  id: string; name: string; country: string; country_code: string;
  tagline: string; description: string; hero_image: string;
  lat: number; lng: number; poi_count: number; quest_count: number;
};
export type POI = {
  id: string; city_id: string; name: string; category: string;
  description: string; image: string; lat: number; lng: number;
  rating: number; xp_reward: number;
};
export type Trivia = { question: string; options: string[]; correct_index: number };
export type Quest = {
  id: string; city_id: string; title: string; description: string;
  difficulty: "easy" | "medium" | "hard"; category: string;
  xp_reward: number; poi_ids: string[]; cover_image: string;
  estimated_minutes: number; badge_name?: string; trivia?: Trivia;
};
export type Progress = {
  device_id: string; display_name: string; xp: number;
  completed_quests: string[]; badges: string[];
  check_ins: { quest_id: string; poi_id?: string; lat?: number; lng?: number; at: string }[];
  level: number; title: string; current_threshold: number; next_threshold: number; progress: number;
};
export type CheckInResult = {
  success: boolean; xp_earned: number; total_xp: number; level: number;
  level_title: string; leveled_up: boolean; quest_completed: boolean;
  badge_unlocked?: string; message: string;
};
export type LeaderEntry = {
  device_id: string; display_name: string; xp: number; level: number;
  title: string; badges: number; quests: number;
};

export const api = {
  cities: () => jget<City[]>("/cities"),
  city: (id: string) => jget<City>(`/cities/${id}`),
  pois: (id: string, category?: string) =>
    jget<POI[]>(`/cities/${id}/pois${category && category !== "all" ? `?category=${category}` : ""}`),
  food: (id: string) => jget<POI[]>(`/cities/${id}/food`),
  quests: (id: string, difficulty?: string) =>
    jget<Quest[]>(`/cities/${id}/quests${difficulty && difficulty !== "all" ? `?difficulty=${difficulty}` : ""}`),
  quest: (id: string) => jget<Quest>(`/quests/${id}`),
  progress: (deviceId: string) => jget<Progress>(`/progress/${deviceId}`),
  checkIn: (payload: {
    device_id: string; quest_id: string; poi_id?: string;
    lat?: number; lng?: number; trivia_answer_index?: number; display_name?: string;
  }) => jpost<CheckInResult>("/progress/check-in", payload),
  leaderboard: () => jget<LeaderEntry[]>("/leaderboard"),
};
