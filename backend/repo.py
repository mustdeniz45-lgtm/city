"""Data-access layer for CityQuest.

Provides a single async API that backs either MongoDB or Supabase, chosen by
the `DATA_BACKEND` env var (`mongo` | `supabase`). All callers in server.py
go through this module so we can flip backends without touching routes.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, Dict, List, Optional

from supabase_client import get_supabase, data_backend

# ---------------- Mongo handles (lazy) ----------------
_mongo_db = None


def _mongo():
    global _mongo_db
    if _mongo_db is not None:
        return _mongo_db
    from motor.motor_asyncio import AsyncIOMotorClient

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    _mongo_db = client[os.environ["DB_NAME"]]
    return _mongo_db


def _is_supabase() -> bool:
    return data_backend() == "supabase"


async def _sb_call(fn):
    """Run a blocking supabase-py call off the event loop."""
    return await asyncio.to_thread(fn)


def _strip_id(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for r in rows:
        r.pop("_id", None)
    return rows


# ---------------- CITIES ----------------

async def cities_list() -> List[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(lambda: sb.table("cities").select("*").execute())
        return res.data or []
    docs = await _mongo().cities.find({}, {"_id": 0}).to_list(100)
    return docs


async def cities_get(city_id: str) -> Optional[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("cities").select("*").eq("id", city_id).limit(1).execute()
        )
        return (res.data or [None])[0]
    return await _mongo().cities.find_one({"id": city_id}, {"_id": 0})


async def cities_set_counts(city_id: str, poi_count: int, quest_count: int) -> None:
    if _is_supabase():
        sb = get_supabase()
        await _sb_call(
            lambda: sb.table("cities")
            .update({"poi_count": poi_count, "quest_count": quest_count})
            .eq("id", city_id)
            .execute()
        )
        return
    await _mongo().cities.update_one(
        {"id": city_id},
        {"$set": {"poi_count": poi_count, "quest_count": quest_count}},
    )


# ---------------- POIs ----------------

async def pois_list(
    city_id: str,
    category: Optional[str] = None,
    kultur_yolu: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()

        def run():
            q = sb.table("pois").select("*").eq("city_id", city_id)
            if category and category != "all":
                q = q.eq("category", category)
            if kultur_yolu is True:
                q = q.eq("kultur_yolu", True)
            return q.order("ky_seq", desc=False, nullsfirst=False).limit(2000).execute()

        res = await _sb_call(run)
        return res.data or []
    q: Dict[str, Any] = {"city_id": city_id}
    if category and category != "all":
        q["category"] = category
    if kultur_yolu is True:
        q["kultur_yolu"] = True
    return await _mongo().pois.find(q, {"_id": 0}).sort([("ky_seq", 1)]).to_list(2000)


async def pois_kultur_yolu(city_id: str) -> List[Dict[str, Any]]:
    return await pois_list(city_id, kultur_yolu=True)


async def pois_food(city_id: str) -> List[Dict[str, Any]]:
    return await pois_list(city_id, category="restaurant")


async def pois_get(poi_id: str) -> Optional[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("pois").select("*").eq("id", poi_id).limit(1).execute()
        )
        return (res.data or [None])[0]
    return await _mongo().pois.find_one({"id": poi_id}, {"_id": 0})


async def pois_count(city_id: str) -> int:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("pois").select("id", count="exact", head=True).eq("city_id", city_id).execute()
        )
        return res.count or 0
    return await _mongo().pois.count_documents({"city_id": city_id})


# ---------------- DISHES ----------------

async def dishes_list(city_id: str) -> List[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("dishes").select("*").eq("city_id", city_id).limit(500).execute()
        )
        return res.data or []
    return await _mongo().dishes.find({"city_id": city_id}, {"_id": 0}).to_list(500)


# ---------------- QUESTS ----------------

async def quests_list(city_id: str, difficulty: Optional[str] = None) -> List[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()

        def run():
            q = sb.table("quests").select("*").eq("city_id", city_id)
            if difficulty and difficulty != "all":
                q = q.eq("difficulty", difficulty)
            return q.limit(500).execute()

        res = await _sb_call(run)
        return res.data or []
    q: Dict[str, Any] = {"city_id": city_id}
    if difficulty and difficulty != "all":
        q["difficulty"] = difficulty
    return await _mongo().quests.find(q, {"_id": 0}).to_list(500)


async def quests_get(quest_id: str) -> Optional[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("quests").select("*").eq("id", quest_id).limit(1).execute()
        )
        return (res.data or [None])[0]
    return await _mongo().quests.find_one({"id": quest_id}, {"_id": 0})


async def quests_for_poi(city_id: str, poi_id: str) -> List[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        # poi_ids is jsonb — use raw `cs` (contains) filter with a JSON array value.
        import json as _json
        needle = _json.dumps([poi_id])
        res = await _sb_call(
            lambda: sb.table("quests")
            .select("id, poi_ids")
            .eq("city_id", city_id)
            .filter("poi_ids", "cs", needle)
            .limit(500)
            .execute()
        )
        return res.data or []
    return await _mongo().quests.find(
        {"city_id": city_id, "poi_ids": poi_id},
        {"_id": 0, "id": 1},
    ).to_list(500)


async def quests_ids_for_city(city_id: str) -> List[str]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("quests").select("id").eq("city_id", city_id).limit(2000).execute()
        )
        return [r["id"] for r in (res.data or [])]
    docs = await _mongo().quests.find({"city_id": city_id}, {"_id": 0, "id": 1}).to_list(2000)
    return [d["id"] for d in docs]


async def quests_count(city_id: str) -> int:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("quests").select("id", count="exact", head=True).eq("city_id", city_id).execute()
        )
        return res.count or 0
    return await _mongo().quests.count_documents({"city_id": city_id})


# ---------------- PROGRESS ----------------

async def progress_get(device_id: str) -> Optional[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("progress").select("*").eq("device_id", device_id).limit(1).execute()
        )
        return (res.data or [None])[0]
    return await _mongo().progress.find_one({"device_id": device_id}, {"_id": 0})


async def progress_upsert(device_id: str, data: Dict[str, Any]) -> None:
    """Upsert a progress row keyed by device_id."""
    data = {k: v for k, v in data.items() if k != "_id"}
    data["device_id"] = device_id
    if _is_supabase():
        sb = get_supabase()
        # Ensure NOT NULL columns have a default for first insert.
        defaults = {
            "completed_quests": data.get("completed_quests", []),
            "badges": data.get("badges", []),
            "check_ins": data.get("check_ins", []),
            "quest_progress": data.get("quest_progress", {}),
            "xp": data.get("xp", 0),
            "display_name": data.get("display_name") or "Traveler",
        }
        merged = {**defaults, **data}
        # Strip None values so Supabase preserves DB defaults / existing values.
        merged = {k: v for k, v in merged.items() if v is not None}
        await _sb_call(
            lambda: sb.table("progress").upsert(merged, on_conflict="device_id").execute()
        )
        return
    await _mongo().progress.update_one({"device_id": device_id}, {"$set": data}, upsert=True)


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
    if _is_supabase():
        sb = get_supabase()
        existing = await progress_get(device_id)
        if existing:
            await _sb_call(
                lambda: sb.table("progress").update(update).eq("device_id", device_id).execute()
            )
        else:
            row = {
                "device_id": device_id,
                "xp": 0,
                "completed_quests": [],
                "badges": [],
                "check_ins": [],
                "quest_progress": {},
                **update,
            }
            await _sb_call(
                lambda: sb.table("progress").upsert(row, on_conflict="device_id").execute()
            )
        return list(update.keys())
    await _mongo().progress.update_one(
        {"device_id": device_id},
        {
            "$set": update,
            "$setOnInsert": {
                "device_id": device_id,
                "xp": 0,
                "completed_quests": [],
                "badges": [],
                "check_ins": [],
            },
        },
        upsert=True,
    )
    return list(update.keys())


async def progress_leaderboard(limit: int = 50) -> List[Dict[str, Any]]:
    if _is_supabase():
        sb = get_supabase()
        res = await _sb_call(
            lambda: sb.table("progress").select("*").order("xp", desc=True).limit(limit).execute()
        )
        return res.data or []
    return await _mongo().progress.find({}, {"_id": 0}).sort("xp", -1).limit(limit).to_list(limit)


async def progress_link_user(device_id: str, user_id: str) -> Dict[str, Any]:
    """Attach `user_id` to the progress row for this device.

    Because the schema enforces `unique(user_id)`, we must ensure at most one
    row per user_id. If the user already has progress on a different device,
    we **merge** that row into the new device's row (sum/union XP, badges,
    check-ins, quest-progress) and delete the old row.

    Returns one of:
      {"status": "already"}   — nothing changed (already linked)
      {"status": "linked"}    — user_id set on existing device row
      {"status": "created"}   — fresh row created
      {"status": "merged"}    — merged a prior row belonging to the same user
      {"status": "conflict"}  — current device row already owned by someone else
    """
    from postgrest.exceptions import APIError  # local import; only used in supabase path

    existing_device = await progress_get(device_id)
    if existing_device:
        owner = existing_device.get("user_id")
        if owner and owner != user_id:
            return {"status": "conflict", "owner": owner}

    # Find any OTHER row already owned by this user (one-user-many-devices case).
    other: Optional[Dict[str, Any]] = None
    if _is_supabase():
        sb = get_supabase()
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
    else:
        other = await _mongo().progress.find_one(
            {"user_id": user_id, "device_id": {"$ne": device_id}}, {"_id": 0}
        )

    # If the user already has a separate row → MERGE that into this device's row.
    if other:
        target = existing_device or {
            "device_id": device_id, "xp": 0,
            "completed_quests": [], "badges": [], "check_ins": [], "quest_progress": {},
        }
        merged = _merge_progress(target, other, user_id, device_id)
        try:
            if _is_supabase():
                sb = get_supabase()
                # Delete the OLD row first to release the unique(user_id) slot.
                await _sb_call(
                    lambda: sb.table("progress").delete().eq("device_id", other["device_id"]).execute()
                )
            else:
                await _mongo().progress.delete_one({"device_id": other["device_id"]})
            await progress_upsert(device_id, merged)
        except APIError as e:
            return {"status": "error", "error": str(e)}
        return {
            "status": "merged",
            "from_device": other["device_id"],
            "to_device": device_id,
            "user_id": user_id,
        }

    # No prior row for this user. Three simple paths.
    if existing_device:
        owner = existing_device.get("user_id")
        if owner == user_id:
            return {"status": "already", "device_id": device_id, "user_id": user_id}
        # owner is None → set it
        try:
            if _is_supabase():
                sb = get_supabase()
                await _sb_call(
                    lambda: sb.table("progress").update({"user_id": user_id}).eq("device_id", device_id).execute()
                )
            else:
                await _mongo().progress.update_one(
                    {"device_id": device_id}, {"$set": {"user_id": user_id}}
                )
        except APIError as e:
            return {"status": "error", "error": str(e)}
        return {"status": "linked", "device_id": device_id, "user_id": user_id}

    # Fresh row.
    seed = {
        "device_id": device_id,
        "user_id": user_id,
        "display_name": "Traveler",
        "xp": 0,
        "completed_quests": [],
        "badges": [],
        "check_ins": [],
        "quest_progress": {},
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
        "device_id": device_id,
        "user_id": user_id,
        "display_name": a.get("display_name") or b.get("display_name") or "Traveler",
        "avatar_uri": a.get("avatar_uri") or b.get("avatar_uri"),
        "xp": max(int(a.get("xp") or 0), int(b.get("xp") or 0)),
        "completed_quests": uniq((a.get("completed_quests") or []) + (b.get("completed_quests") or [])),
        "badges": uniq((a.get("badges") or []) + (b.get("badges") or [])),
        "check_ins": (a.get("check_ins") or []) + (b.get("check_ins") or []),
        "quest_progress": qp_merged,
    }
