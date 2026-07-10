/**
 * Friend-list storage — device-local (AsyncStorage), no server side-effects.
 *
 * We deliberately keep the friend list on the device (Approach A2+B1 from
 * the design doc) so that:
 *   • adding/removing a friend is instant and offline-safe,
 *   • we don't need a separate `friendships` table + RLS policy,
 *   • friend graphs stay private (no server sees who added whom).
 *
 * The backend simply resolves a batch of `friend_code` values into public
 * leaderboard entries; the "who is my friend" mapping never leaves the
 * phone. If the user reinstalls the app, they'll need to re-add friends —
 * a fair MVP tradeoff.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "cq.friends.v1";

export type SavedFriend = {
  code: string;         // canonical friend code, e.g. "CQ7K4P9X"
  nickname: string;     // display name captured at time of add (may drift; UI refreshes on load)
  added_at: string;     // ISO date — used for sort-stable rendering when XP ties
};

/** Normalise a raw string into the canonical friend-code form. */
export function normalizeCode(raw: string): string {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function listFriends(): Promise<SavedFriend[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function _write(list: SavedFriend[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

/** Add a friend. Idempotent — re-adding the same code just updates nickname. */
export async function addFriend(code: string, nickname: string): Promise<SavedFriend[]> {
  const canonical = normalizeCode(code);
  if (!canonical) return listFriends();
  const list = await listFriends();
  const idx = list.findIndex((f) => f.code === canonical);
  const entry: SavedFriend = {
    code: canonical,
    nickname: nickname || "Traveler",
    added_at: idx >= 0 ? list[idx].added_at : new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = entry; else list.unshift(entry);
  await _write(list);
  return list;
}

export async function removeFriend(code: string): Promise<SavedFriend[]> {
  const canonical = normalizeCode(code);
  const next = (await listFriends()).filter((f) => f.code !== canonical);
  await _write(next);
  return next;
}

export async function hasFriend(code: string): Promise<boolean> {
  const canonical = normalizeCode(code);
  return (await listFriends()).some((f) => f.code === canonical);
}
