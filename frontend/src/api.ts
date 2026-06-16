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
  kultur_yolu?: boolean; ky_seq?: number | null; name_tr?: string | null;
  metadata?: {
    address?: string | null;
    plus_code?: string | null;
    tr_description?: string | null;
    raw_categories?: string[] | null;
  } | null;
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
  quest_progress?: Record<string, { visited: string[] }>;
  level: number; title: string; current_threshold: number; next_threshold: number; progress: number;
  avatar_uri?: string | null;
};
export type CheckInResult = {
  success: boolean; xp_earned: number; total_xp: number; level: number;
  level_title: string; leveled_up: boolean; quest_completed: boolean;
  badge_unlocked?: string;
  city_stamped?: boolean;
  stamped_city_name?: string | null;
  visited_pois?: string[];
  total_pois?: number;
  awaiting_trivia?: boolean;
  too_far?: boolean;
  distance_m?: number | null;
  message: string;
};
export type LeaderEntry = {
  device_id: string; display_name: string; xp: number; level: number;
  title: string; badges: number; quests: number;
  avatar_uri?: string | null;
};
export type CityProgress = {
  city_id: string; name: string; country: string; country_code: string;
  hero_image: string; total_quests: number; completed_quests: number;
  percent: number; completed: boolean; stamped_at: string | null;
};

export const api = {
  cities: () => jget<City[]>("/cities"),
  city: (id: string) => jget<City>(`/cities/${id}`),
  pois: (id: string, category?: string, kulturYolu?: boolean) => {
    const params: string[] = [];
    if (category && category !== "all") params.push(`category=${category}`);
    if (kulturYolu) params.push("kultur_yolu=true");
    const qs = params.length ? `?${params.join("&")}` : "";
    return jget<POI[]>(`/cities/${id}/pois${qs}`);
  },
  kulturYolu: (id: string) => jget<POI[]>(`/cities/${id}/kultur-yolu`),
  food: (id: string) => jget<POI[]>(`/cities/${id}/food`),
  dishes: (id: string) => jget<{ id: string; city_id: string; name: string; description: string; image: string; tags: string[] }[]>(`/cities/${id}/dishes`),
  quests: (id: string, difficulty?: string) =>
    jget<Quest[]>(`/cities/${id}/quests${difficulty && difficulty !== "all" ? `?difficulty=${difficulty}` : ""}`),
  quest: (id: string) => jget<Quest>(`/quests/${id}`),
  poi: (id: string) => jget<POI>(`/pois/${id}`),
  poiCheckIn: (payload: { device_id: string; poi_id: string; lat?: number; lng?: number; display_name?: string }) =>
    jpost<{ success: boolean; too_far: boolean; distance_m: number | null; quests_credited: string[]; already_visited: boolean; message: string }>(
      "/progress/poi-check-in",
      payload,
    ),
  progress: (deviceId: string) => jget<Progress>(`/progress/${deviceId}`),
  checkIn: (payload: {
    device_id: string; quest_id: string; poi_id?: string;
    lat?: number; lng?: number; trivia_answer_index?: number; display_name?: string;
  }) => jpost<CheckInResult>("/progress/check-in", payload),
  leaderboard: () => jget<LeaderEntry[]>("/leaderboard"),
  progressByCity: (deviceId: string) => jget<CityProgress[]>(`/progress/${deviceId}/by-city`),
  updateProfile: (deviceId: string, payload: { display_name?: string; avatar_uri?: string | null }) =>
    jpost<{ ok: boolean }>(`/progress/${deviceId}/profile`, payload),
  linkDevice: (token: string, deviceId: string) =>
    fetch(`${BASE}/api/auth/link-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ device_id: deviceId }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`link-device failed: ${r.status}`);
      return r.json() as Promise<{ status: string; user_id: string; device_id: string }>;
    }),
};
