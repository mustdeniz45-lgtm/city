/**
 * store.v2.ts — Supabase-Auth-first identity replacement for `store.ts`.
 *
 * Migration: instead of the client-generated `device_id`, the canonical
 * identity is `session.user.id` (a Supabase-issued UUID). When a fresh app
 * has no session at all, we silently create a real Supabase anonymous user
 * via `supabase.auth.signInAnonymously()` — so every user, guest or not,
 * has a server-issued JWT from boot.
 *
 * ─── Why this is more secure ──────────────────────────────────────────────
 *   • The identity is minted by Supabase Auth, never the client.
 *   • Every request to the FastAPI backend can carry `Authorization: Bearer
 *     <access_token>` and be verified against Supabase's JWKS.
 *   • Postgres RLS policies can be written as `auth.uid() = user_id`,
 *     making tampering with someone else's XP or leaderboard entry
 *     structurally impossible.
 *   • Upgrading a guest to a permanent account (email/password or OAuth)
 *     PRESERVES the same user_id — no data migration needed.
 *
 * ─── Public API (matches the old store where possible) ────────────────────
 *   getUserId()      → Promise<string>          // canonical identity
 *   ensureSession()  → Promise<Session>         // hydrates + anon sign-in
 *   isAnonymous()    → Promise<boolean>
 *   getAccessToken() → Promise<string | null>   // for backend requests
 *   getActiveCity / setActiveCity                 (unchanged)
 *   getDisplayName / setDisplayName               (now delegates to Supabase user_metadata)
 *   getAvatarUri  / setAvatarUri                  (now delegates to Supabase user_metadata)
 *   AppContext + useApp()                         (now exposes `userId` instead of `deviceId`)
 */

import { createContext, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import type { Session } from "@supabase/supabase-js";

const CITY_KEY = "cityquest_active_city";

// ─── Session bootstrap ────────────────────────────────────────────────────

/**
 * Return an active session, hydrating from storage or creating a new
 * anonymous Supabase user if none exists. Idempotent + concurrent-safe:
 * two racing callers get the SAME promise.
 */
let _ensurePromise: Promise<Session> | null = null;
export function ensureSession(): Promise<Session> {
  if (_ensurePromise) return _ensurePromise;
  _ensurePromise = (async () => {
    // 1. Reuse cached session if valid.
    const { data: cur } = await supabase.auth.getSession();
    if (cur.session) return cur.session;

    // 2. Otherwise sign in anonymously. Requires the "Anonymous Sign-ins"
    //    toggle to be enabled in Supabase Dashboard → Authentication →
    //    Providers → Anonymous. If it's off, this call returns an error.
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn("[store.v2] signInAnonymously failed:", error.message);
      throw error;
    }
    if (!data.session) throw new Error("Anonymous sign-in returned no session");
    return data.session;
  })();
  // Reset the memo if this specific attempt failed, so a retry can proceed.
  _ensurePromise.catch(() => { _ensurePromise = null; });
  return _ensurePromise;
}

/** Canonical user id — Supabase-issued UUID. */
export async function getUserId(): Promise<string> {
  const session = await ensureSession();
  return session.user.id;
}

/** True if the current user is anonymous (has not upgraded to email/OAuth). */
export async function isAnonymous(): Promise<boolean> {
  const session = await ensureSession();
  // Supabase attaches `is_anonymous: true` to anon users. Some client
  // versions expose it under `session.user.is_anonymous` directly.
  return Boolean(
    (session.user as any)?.is_anonymous ??
    (session.user?.app_metadata as any)?.is_anonymous ??
    false,
  );
}

/** Short-lived access token you can pass to your FastAPI backend. */
export async function getAccessToken(): Promise<string | null> {
  // Always call getSession() so supabase-js can refresh a stale token.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ─── City picker (still purely client-side / cross-device is out of scope) ─

export async function getActiveCity(): Promise<string> {
  return (await AsyncStorage.getItem(CITY_KEY)) ?? "gaziantep";
}
export async function setActiveCity(id: string) {
  await AsyncStorage.setItem(CITY_KEY, id);
}

// ─── Display name + avatar now live on the Supabase user ──────────────────
// This makes them appear on the leaderboard for every device that logs in.
// We still cache locally for fast synchronous reads on cold start.

const NAME_CACHE_KEY = "cityquest_display_name_cache";
const AVATAR_CACHE_KEY = "cityquest_avatar_uri_cache";

export async function getDisplayName(): Promise<string> {
  const session = await ensureSession();
  const fromMeta = (session.user.user_metadata as any)?.display_name;
  if (fromMeta) {
    AsyncStorage.setItem(NAME_CACHE_KEY, fromMeta).catch(() => {});
    return fromMeta;
  }
  return (await AsyncStorage.getItem(NAME_CACHE_KEY)) ?? "Traveler";
}

export async function setDisplayName(name: string): Promise<void> {
  await AsyncStorage.setItem(NAME_CACHE_KEY, name);
  const { error } = await supabase.auth.updateUser({
    data: { display_name: name },
  });
  if (error) console.warn("[store.v2] updateUser(display_name):", error.message);
}

export async function getAvatarUri(): Promise<string | null> {
  const session = await ensureSession();
  const fromMeta = (session.user.user_metadata as any)?.avatar_uri;
  if (fromMeta) {
    AsyncStorage.setItem(AVATAR_CACHE_KEY, fromMeta).catch(() => {});
    return fromMeta;
  }
  return await AsyncStorage.getItem(AVATAR_CACHE_KEY);
}

export async function setAvatarUri(uri: string | null): Promise<void> {
  if (uri) await AsyncStorage.setItem(AVATAR_CACHE_KEY, uri);
  else await AsyncStorage.removeItem(AVATAR_CACHE_KEY);
  const { error } = await supabase.auth.updateUser({
    data: { avatar_uri: uri },
  });
  if (error) console.warn("[store.v2] updateUser(avatar_uri):", error.message);
}

// ─── React context for cross-tab state ────────────────────────────────────

type AppCtx = {
  activeCityId: string;
  setActiveCityId: (id: string) => void;
  userId: string;                       // ← replaces `deviceId`
  isAnonymousUser: boolean;
  refreshProgress: () => void;
  progressVersion: number;
};

export const AppContext = createContext<AppCtx>({
  activeCityId: "gaziantep",
  setActiveCityId: () => {},
  userId: "",
  isAnonymousUser: true,
  refreshProgress: () => {},
  progressVersion: 0,
});

export const useApp = () => useContext(AppContext);
