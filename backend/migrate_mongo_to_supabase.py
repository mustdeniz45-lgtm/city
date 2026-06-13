"""One-shot migration: MongoDB → Supabase.

Reads cities, pois, dishes, quests, progress from Mongo and upserts into Supabase
using the service-role client (bypasses RLS).

Usage:
    cd /app/backend && python migrate_mongo_to_supabase.py
    cd /app/backend && python migrate_mongo_to_supabase.py --wipe   # truncate Supabase content tables first
"""
import asyncio
import os
import sys
from typing import Any, Dict, List

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

from supabase_client import get_supabase  # noqa: E402

ALLOWED_FIELDS: Dict[str, set] = {
    "cities": {
        "id", "name", "country", "country_code", "tagline", "description",
        "hero_image", "lat", "lng", "poi_count", "quest_count",
    },
    "pois": {
        "id", "city_id", "name", "name_tr", "category", "description", "image",
        "lat", "lng", "rating", "xp_reward", "kultur_yolu", "ky_seq", "source",
        "metadata",
    },
    "dishes": {
        "id", "city_id", "name", "description", "image", "tags",
    },
    "quests": {
        "id", "city_id", "title", "description", "difficulty", "category",
        "xp_reward", "poi_ids", "cover_image", "estimated_minutes",
        "badge_name", "trivia",
    },
    "progress": {
        "device_id", "display_name", "avatar_uri", "xp", "completed_quests",
        "badges", "check_ins", "quest_progress",
    },
}


def sanitize(row: Dict[str, Any], allowed: set) -> Dict[str, Any]:
    row.pop("_id", None)
    return {k: v for k, v in row.items() if k in allowed}


# Ensure NOT NULL JSON columns have a sane default if the Mongo doc omits them.
JSON_DEFAULTS: Dict[str, Dict[str, Any]] = {
    "progress": {
        "completed_quests": [],
        "badges": [],
        "check_ins": [],
        "quest_progress": {},
        "display_name": "Traveler",
        "xp": 0,
    },
    "pois":   {"metadata": {}},
    "dishes": {"tags": []},
    "quests": {"poi_ids": []},
}


def with_defaults(table: str, row: Dict[str, Any]) -> Dict[str, Any]:
    for k, v in JSON_DEFAULTS.get(table, {}).items():
        if row.get(k) is None:
            row[k] = v
    return row


def chunk(lst: List[Any], n: int):
    for i in range(0, len(lst), n):
        yield lst[i : i + n]


async def fetch_collection(db, name: str) -> List[Dict[str, Any]]:
    cur = db[name].find({})
    docs = []
    async for d in cur:
        docs.append(with_defaults(name, sanitize(d, ALLOWED_FIELDS[name])))
    return docs


async def main(wipe: bool = False):
    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured. Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env")
        sys.exit(1)

    mongo = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    cities = await fetch_collection(db, "cities")
    pois = await fetch_collection(db, "pois")
    dishes = await fetch_collection(db, "dishes")
    quests = await fetch_collection(db, "quests")
    progress = await fetch_collection(db, "progress")

    print(f"📦 Mongo source counts: cities={len(cities)} pois={len(pois)} dishes={len(dishes)} quests={len(quests)} progress={len(progress)}")

    if wipe:
        for tbl in ("progress", "quests", "dishes", "pois", "cities"):
            # delete with a true predicate
            sb.table(tbl).delete().neq("id" if tbl != "progress" else "device_id", "__never__").execute()
            print(f"  🗑️  Wiped {tbl}")

    def upsert(table: str, rows: List[Dict[str, Any]], conflict: str = "id"):
        if not rows:
            print(f"  ⏭️  {table}: nothing to insert")
            return
        total = 0
        for batch in chunk(rows, 200):
            res = sb.table(table).upsert(batch, on_conflict=conflict).execute()
            total += len(res.data or [])
        print(f"  ✅ {table}: upserted {total}/{len(rows)}")

    upsert("cities", cities)
    upsert("pois", pois)
    upsert("dishes", dishes)
    upsert("quests", quests)
    upsert("progress", progress, conflict="device_id")

    # verify
    print("\n🔍 Supabase row counts after migration:")
    for tbl in ("cities", "pois", "dishes", "quests", "progress"):
        r = sb.table(tbl).select("*", count="exact", head=True).execute()
        print(f"  {tbl}: {r.count}")

    print("\n🎉 Migration complete.")


if __name__ == "__main__":
    asyncio.run(main(wipe="--wipe" in sys.argv))
