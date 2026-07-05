const BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

// Lazy import to avoid a circular dep and to keep the API layer usable in
// pure Node tests. During shadow mode we ATTACH the Supabase JWT if a
// session exists — the backend logs the (device_id, user_id) pair to catch
// mismatches — but we don't yet fail requests that lack a token. Phase 2
// flips this to strict enforcement.
async function _authHeader(): Promise<Record<string, string>> {
  try {
    const { supabase } = await import("./supabase");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/**
 * Error carrying the HTTP status + backend-supplied detail message. Callers
 * (e.g. the POI check-in screen) can inspect `err.status === 429` and render
 * the friendly anti-cheat reason from `err.message`.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function readError(res: Response, verb: string, path: string): Promise<never> {
  let msg = "";
  try {
    const j = await res.json();
    msg = typeof j?.detail === "string" ? j.detail : (typeof j?.message === "string" ? j.message : "");
  } catch { /* body not JSON — fall through */ }
  throw new ApiError(res.status, msg || `${verb} ${path} failed: ${res.status}`);
}

async function jget<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { headers: await _authHeader() });
  if (!res.ok) return readError(res, "GET", path);
  return res.json();
}
async function jpost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await _authHeader()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) return readError(res, "POST", path);
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
    phone?: string | null;
    google_rating?: number | null;
    review_count?: number | null;
    working_hours?: string | null;
    google_maps_url?: string | null;
    specialty?: string | null;
  } | null;
};
export type Trivia = { question: string; options: string[]; correct_index: number };
export type CandidateSummary = {
  id: string; kind: "poi" | "dish"; name: string; image: string;
  category?: string; visited: boolean;
};
export type RequirementItem = {
  key: string; label: string;
  type: "specific" | "category" | "dishes" | "check_ins" | "ky_all" | "legacy";
  current: number; need: number; poi_id?: string;
  candidates?: CandidateSummary[];
};
export type QuestRequirements = {
  min_check_ins?: number;
  specific_pois?: string[];
  category_groups?: { key: string; need: number; label: string; from_category?: string; from_raw?: string; from_ids?: string[] }[];
  dishes_min?: number;
  ky_visit_all?: boolean;
};
export type Quest = {
  id: string; city_id: string; title: string; description: string;
  difficulty: "easy" | "medium" | "hard"; category: string;
  xp_reward: number; poi_ids: string[]; cover_image: string;
  estimated_minutes: number; badge_name?: string; trivia?: Trivia;
  requirements?: QuestRequirements | null;
};
export type QuestProgressResponse = {
  quest_id: string; completed: boolean; satisfied: boolean;
  progress: RequirementItem[];
};
export type Progress = {
  device_id: string; display_name: string; xp: number;
  completed_quests: string[]; badges: string[];
  check_ins: { quest_id: string; poi_id?: string; lat?: number; lng?: number; at: string }[];
  quest_progress?: Record<string, { visited: string[] }>;
  level: number; title: string; current_threshold: number; next_threshold: number; progress: number;
  avatar_uri?: string | null;
  friend_code?: string | null;
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
export type FriendEntry = {
  friend_code: string; display_name: string; xp: number; level: number;
  title: string; badges: number; quests: number;
  avatar_uri?: string | null; is_anonymous?: boolean;
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
  questProgress: (id: string, deviceId: string) =>
    jget<QuestProgressResponse>(`/quests/${id}/progress?device_id=${encodeURIComponent(deviceId)}`),
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
  friendLookup: (code: string) => jget<FriendEntry>(`/friends/lookup/${encodeURIComponent(code)}`),
  friendsLeaderboard: (codes: string[]) => jpost<FriendEntry[]>("/friends/leaderboard", { codes }),
  progressByCity: (deviceId: string) => jget<CityProgress[]>(`/progress/${deviceId}/by-city`),
  updateProfile: (deviceId: string, payload: { display_name?: string; avatar_uri?: string | null }) =>
    jpost<{ ok: boolean }>(`/progress/${deviceId}/profile`, payload),
  dish: (id: string) => jget<{ id: string; city_id: string; name: string; description: string; image: string; tags: string[] }>(`/dishes/${id}`),
  dishTried: (payload: { device_id: string; dish_id: string; dish_name?: string; display_name?: string }) =>
    jpost<{ success: boolean; already_tried: boolean; xp_earned: number; total_xp: number; tried_dishes: string[]; leveled_up: boolean; message: string }>(
      "/progress/dish-tried", payload),
  linkDevice: (token: string, deviceId: string) =>
    fetch(`${BASE}/api/auth/link-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ device_id: deviceId }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(`link-device failed: ${r.status}`);
      return r.json() as Promise<{ status: string; user_id: string; device_id: string }>;
    }),
  // CityQuest Verified Score (CVS)
  cvs: (poiId: string) => jget<CVSResponse>(`/pois/${poiId}/cvs`),
  cvsSummary: (cityId: string) => jget<Record<string, number>>(`/cities/${cityId}/cvs-summary`),
  reviewEligibility: (poiId: string, deviceId: string) =>
    jget<{ eligible: boolean; window_hours: number; reason: string | null }>(
      `/pois/${poiId}/reviews/eligibility?device_id=${encodeURIComponent(deviceId)}`
    ),
  reviews: (poiId: string) => jget<ReviewRow[]>(`/pois/${poiId}/reviews`),
  submitReview: (poiId: string, payload: {
    device_id: string; overall: number;
    dimensions: Record<string, number>; comment?: string;
  }) => jpost<{ ok: boolean; review: ReviewRow }>(`/pois/${poiId}/reviews`, payload),
};

export type CVSResponse = {
  cvs: number; confidence: "high" | "medium" | "low";
  review_count: number; verified_count: number;
  cq_score: number | null; google_score: number;
  user_trust_score: number;
  dimensions: Record<string, number | null>;
  breakdown_weights: { cityquest: number; trust: number; google: number };
};
export type ReviewRow = {
  id: string; poi_id: string; device_id: string;
  overall: number; dimensions: Record<string, number>;
  comment: string | null; verified: boolean;
  helpful_count: number; created_at: string;
  author?: { display_name?: string; avatar_uri?: string; xp?: number; title?: string; level?: number };
};
