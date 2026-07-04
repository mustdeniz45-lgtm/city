"""Data-access layer for CityQuest — **Supabase only**.

Historically this module maintained parallel Mongo and Supabase code paths
chosen at runtime by the `DATA_BACKEND` env var. Mongo has now been retired
(see 2026-07-04 architectural decision) and this file exposes a single set
of async functions that talk to Supabase via the sync `supabase-py` client
wrapped in `asyncio.to_thread`.

Everything in `server.py` goes through this module so we can:
  * swap the PostgREST client for direct psycopg2/asyncpg later,
  * introduce RLS-aware `auth.uid()` scoping without touching routes,
  * make the code path a lot shorter (~230 lines vs ~490 before).
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from postgrest.exceptions import APIError

from supabase_client import get_supabase


# ---------------- Helpers ----------------

async def _sb_call(fn):
    """Run a blocking supabase-py call off the event loop."""
    return await asyncio.to_thread(fn)


# Maps a single-category filter to the raw category names used in the source
# JSON (`metadata.raw_categories`). Lets a single POI surface under multiple
# filters (e.g. Gaziantep Castle in BOTH Landmarks & Museums).
_FILTER_TO_RAW = {
    "landmark":   "landmarks",
    "museum":     "museums",
    "historic":   "historic",
    "restaurant": "restaurant/cafe",
    "must-see":   "nature",
    "mosque":     "mosques",
    "han":        "hans",
    "bath":       "bath",
    "open-air":   "open air museum",
}


def _matches_category(row: Dict[str, Any], category: str) -> bool:
    if row.get("category") == category:
        return True
    raw_needle = _FILTER_TO_RAW.get(category)
    if raw_needle:
        raw_list = ((row.get("metadata") or {}).get("raw_categories")) or []
        if raw_needle in raw_list:
            return True
    return False


# ---------------- CITIES ----------------

async def cities_list() -> List[Dict[str, Any]]:
    sb = get_supabase()
    res = await _sb_call(lambda: sb.table("cities").select("*").execute())
    return res.data or []


async def cities_get(city_id: str) -> Optional[Dict[str, Any]]:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("cities").select("*").eq("id", city_id).limit(1).execute()
    )
    return (res.data or [None])[0]


async def cities_set_counts(city_id: str, poi_count: int, quest_count: int) -> None:
    sb = get_supabase()
    await _sb_call(
        lambda: sb.table("cities")
        .update({"poi_count": poi_count, "quest_count": quest_count})
        .eq("id", city_id)
        .execute()
    )


# ---------------- POIs ----------------

async def pois_list(
    city_id: str,
    category: Optional[str] = None,
    kultur_yolu: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    sb = get_supabase()

    def run():
        # Category filter runs in Python (not SQL) so multi-category items
        # can surface under each of their listed buckets via raw_categories.
        q = sb.table("pois").select("*").eq("city_id", city_id)
        if kultur_yolu is True:
            q = q.eq("kultur_yolu", True)
        return q.order("ky_seq", desc=False, nullsfirst=False).limit(2000).execute()

    res = await _sb_call(run)
    rows = res.data or []
    if category and category != "all":
        rows = [r for r in rows if _matches_category(r, category)]
    return rows


async def pois_kultur_yolu(city_id: str) -> List[Dict[str, Any]]:
    return await pois_list(city_id, kultur_yolu=True)


async def pois_food(city_id: str) -> List[Dict[str, Any]]:
    return await pois_list(city_id, category="restaurant")


async def pois_get(poi_id: str) -> Optional[Dict[str, Any]]:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("pois").select("*").eq("id", poi_id).limit(1).execute()
    )
    return (res.data or [None])[0]


async def pois_count(city_id: str) -> int:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("pois").select("id", count="exact", head=True).eq("city_id", city_id).execute()
    )
    return res.count or 0


# ---------------- DISHES ----------------

async def dishes_list(city_id: str) -> List[Dict[str, Any]]:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("dishes").select("*").eq("city_id", city_id).limit(500).execute()
    )
    return res.data or []


# ---------------- QUESTS ----------------

async def quests_list(city_id: str, difficulty: Optional[str] = None) -> List[Dict[str, Any]]:
    sb = get_supabase()

    def run():
        q = sb.table("quests").select("*").eq("city_id", city_id)
        if difficulty and difficulty != "all":
            q = q.eq("difficulty", difficulty)
        return q.limit(500).execute()

    res = await _sb_call(run)
    return res.data or []


async def quests_get(quest_id: str) -> Optional[Dict[str, Any]]:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("quests").select("*").eq("id", quest_id).limit(1).execute()
    )
    return (res.data or [None])[0]


async def quests_for_poi(city_id: str, poi_id: str) -> List[Dict[str, Any]]:
    """Quests in `city_id` whose `poi_ids` jsonb array contains `poi_id`."""
    sb = get_supabase()
    needle = json.dumps([poi_id])
    res = await _sb_call(
        lambda: sb.table("quests")
        .select("id, poi_ids")
        .eq("city_id", city_id)
        .filter("poi_ids", "cs", needle)
        .limit(500)
        .execute()
    )
    return res.data or []


async def quests_ids_for_city(city_id: str) -> List[str]:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("quests").select("id").eq("city_id", city_id).limit(2000).execute()
    )
    return [r["id"] for r in (res.data or [])]


async def quests_count(city_id: str) -> int:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("quests").select("id", count="exact", head=True).eq("city_id", city_id).execute()
    )
    return res.count or 0


# ---------------- PROGRESS ----------------

async def progress_get(device_id: str) -> Optional[Dict[str, Any]]:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("progress").select("*").eq("device_id", device_id).limit(1).execute()
    )
    return (res.data or [None])[0]


async def progress_upsert(device_id: str, data: Dict[str, Any]) -> None:
    """Upsert a progress row keyed by device_id.

    Strips ``None`` values so Supabase preserves DB defaults / existing
    values (a common footgun with the PostgREST upsert semantics).
    """
    sb = get_supabase()
    data = {k: v for k, v in data.items() if k != "_id"}
    data["device_id"] = device_id
    defaults = {
        "completed_quests": data.get("completed_quests", []),
        "badges": data.get("badges", []),
        "check_ins": data.get("check_ins", []),
        "quest_progress": data.get("quest_progress", {}),
        "xp": data.get("xp", 0),
        "display_name": data.get("display_name") or "Traveler",
    }
    merged = {**defaults, **data}
    merged = {k: v for k, v in merged.items() if v is not None}
    await _sb_call(
        lambda: sb.table("progress").upsert(merged, on_conflict="device_id").execute()
    )


async def progress_profile_update(
    device_id: str, display_name: Optional[str], avatar_uri: Optional[str], updated_at: str
) -> List[str]:
    update: Dict[str, Any] = {}
    if display_name is not None:
        update["display_name"] = display_name or "Traveler"
    if avatar_uri is not None:
        update["avatar_uri"] = avatar_uri  # may be "" to clear
    if not update:
        return []
    update["updated_at"] = updated_at

    sb = get_supabase()
    existing = await progress_get(device_id)
    if existing:
        await _sb_call(
            lambda: sb.table("progress").update(update).eq("device_id", device_id).execute()
        )
    else:
        row = {
            "device_id": device_id, "xp": 0,
            "completed_quests": [], "badges": [], "check_ins": [], "quest_progress": {},
            **update,
        }
        await _sb_call(
            lambda: sb.table("progress").upsert(row, on_conflict="device_id").execute()
        )
    return list(update.keys())


async def progress_leaderboard(limit: int = 50) -> List[Dict[str, Any]]:
    sb = get_supabase()
    res = await _sb_call(
        lambda: sb.table("progress").select("*").order("xp", desc=True).limit(limit).execute()
    )
    return res.data or []


async def progress_link_user(device_id: str, user_id: str) -> Dict[str, Any]:
    """Attach `user_id` to the progress row for this device.

    Because the schema enforces ``unique(user_id)``, we must ensure at most
    one row per user_id. If the user already has progress on a different
    device, we **merge** that row into the new device's row (union arrays,
    take max XP) and delete the old row.

    Returns one of:
      * ``{"status": "already"}``  — nothing changed (already linked)
      * ``{"status": "linked"}``   — user_id set on existing device row
      * ``{"status": "created"}``  — fresh row created
      * ``{"status": "merged"}``   — merged a prior row belonging to the user
      * ``{"status": "conflict"}`` — device row is owned by someone else
      * ``{"status": "error"}``    — Supabase raised an APIError
    """
    sb = get_supabase()
    existing_device = await progress_get(device_id)
    if existing_device:
        owner = existing_device.get("user_id")
        if owner and owner != user_id:
            return {"status": "conflict", "owner": owner}

    # Find any OTHER row already owned by this user (one-user-many-devices case).
    other: Optional[Dict[str, Any]] = None
    try:
        res = await _sb_call(
            lambda: sb.table("progress").select("*").eq("user_id", user_id).limit(2).execute()
        )
        for row in res.data or []:
            if row.get("device_id") != device_id:
                other = row
                break
    except APIError as e:
        return {"status": "error", "error": str(e)}

    # If the user already has a separate row → MERGE that into this device's row.
    if other:
        target = existing_device or {
            "device_id": device_id, "xp": 0,
            "completed_quests": [], "badges": [], "check_ins": [], "quest_progress": {},
        }
        merged = _merge_progress(target, other, user_id, device_id)
        try:
            # Delete the OLD row first to release the unique(user_id) slot.
            await _sb_call(
                lambda: sb.table("progress").delete().eq("device_id", other["device_id"]).execute()
            )
            await progress_upsert(device_id, merged)
        except APIError as e:
            return {"status": "error", "error": str(e)}
        return {
            "status": "merged", "from_device": other["device_id"],
            "to_device": device_id, "user_id": user_id,
        }

    # No prior row for this user. Three simple paths.
    if existing_device:
        owner = existing_device.get("user_id")
        if owner == user_id:
            return {"status": "already", "device_id": device_id, "user_id": user_id}
        # owner is None → set it
        try:
            await _sb_call(
                lambda: sb.table("progress").update({"user_id": user_id}).eq("device_id", device_id).execute()
            )
        except APIError as e:
            return {"status": "error", "error": str(e)}
        return {"status": "linked", "device_id": device_id, "user_id": user_id}

    # Fresh row.
    seed = {
        "device_id": device_id, "user_id": user_id, "display_name": "Traveler",
        "xp": 0, "completed_quests": [], "badges": [], "check_ins": [], "quest_progress": {},
    }
    try:
        await progress_upsert(device_id, seed)
    except APIError as e:
        return {"status": "error", "error": str(e)}
    return {"status": "created", "device_id": device_id, "user_id": user_id}


def _merge_progress(a: Dict[str, Any], b: Dict[str, Any], user_id: str, device_id: str) -> Dict[str, Any]:
    """Fold `b` into `a`. Takes the union of arrays/maps and the MAX xp."""
    def uniq(seq):
        seen, out = set(), []
        for x in seq or []:
            k = x if isinstance(x, (str, int, float)) else id(x)
            if k not in seen:
                seen.add(k)
                out.append(x)
        return out

    qp_a = a.get("quest_progress") or {}
    qp_b = b.get("quest_progress") or {}
    qp_merged: Dict[str, Any] = {}
    for qid in set(list(qp_a.keys()) + list(qp_b.keys())):
        visited = uniq(((qp_a.get(qid) or {}).get("visited") or []) + ((qp_b.get(qid) or {}).get("visited") or []))
        qp_merged[qid] = {"visited": visited}

    return {
        "device_id": device_id, "user_id": user_id,
        "display_name": a.get("display_name") or b.get("display_name") or "Traveler",
        "avatar_uri": a.get("avatar_uri") or b.get("avatar_uri"),
        "xp": max(int(a.get("xp") or 0), int(b.get("xp") or 0)),
        "completed_quests": uniq((a.get("completed_quests") or []) + (b.get("completed_quests") or [])),
        "badges": uniq((a.get("badges") or []) + (b.get("badges") or [])),
        "check_ins": (a.get("check_ins") or []) + (b.get("check_ins") or []),
        "quest_progress": qp_merged,
    }
