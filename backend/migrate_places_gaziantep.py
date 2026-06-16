"""Full Gaziantep places swap.

Reads /app/backend/seed_assets/places_gaziantep.json (the user-provided
canonical KY dataset, 97 places) and replaces ALL Gaziantep POIs in Supabase
with it. Also remaps the 5 Gaziantep quests' poi_ids to the new IDs by
matching by name (English + Turkish). Quests that cannot be matched are
either re-pointed to a sensible default or left unchanged.

Run once:
    cd /app/backend && python migrate_places_gaziantep.py
    cd /app/backend && python migrate_places_gaziantep.py --dry-run
"""
import json
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

ROOT = Path(__file__).parent
DATA = ROOT / "seed_assets" / "places_gaziantep.json"
CITY_ID = "gaziantep"

CATEGORY_PRIORITY = ["museums", "landmarks", "restaurant/cafe", "nature", "historic"]
CATEGORY_MAP = {
    "museums": "museum",
    "landmarks": "landmark",
    "restaurant/cafe": "restaurant",
    "nature": "must-see",
    "historic": "historic",
}
FALLBACK_IMAGES = {
    "landmark":   "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=600&q=70",
    "museum":     "https://images.unsplash.com/photo-1565060169186-65f5fad44e21?w=600&q=70",
    "historic":   "https://images.unsplash.com/photo-1545569310-50fee1e4b1c4?w=600&q=70",
    "restaurant": "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=70",
    "must-see":   "https://images.unsplash.com/photo-1574586597013-29bd92dc1617?w=600&q=70",
}

# Old quest poi_ids that need remapping. Auto-resolves to new IDs by matching
# the listed substrings against en_name / tr_name in the JSON.
QUEST_REMAPS: dict[str, list[str]] = {
    # quest_id → list of NAME hints (substring match)
    "q-gaz-1": ["Zeugma Mosaic Museum"],
    "q-gaz-2": ["Emine Göğüş"],          # fall-back: cuisine museum (was İmam Çağdaş)
    "q-gaz-3": ["Coppersmiths Bazaar", "Tahmis Coffee House"],
    "q-gaz-4": ["Gaziantep Castle"],
    "q-gaz-5": ["Gaziantep Castle", "Emine Göğüş", "Tahmis Coffee House"],  # Şirvani not in new data
}


def pick_category(cats: list[str]) -> str:
    cats = [c.lower() for c in (cats or [])]
    for key in CATEGORY_PRIORITY:
        if key in cats:
            return CATEGORY_MAP[key]
    return "must-see"


def slugify(s: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", s.lower())
    return s.strip("-")[:60] or "poi"


def build_row(item: dict) -> dict:
    n = int(item.get("n") or 0)
    cat = pick_category(item.get("categories") or [])
    image = item.get("image_url") or FALLBACK_IMAGES[cat]
    en = (item.get("en_name") or item.get("tr_name") or "Unnamed").strip()
    return {
        "id": f"poi-gaz-{n:03d}-{slugify(en)}",
        "city_id": CITY_ID,
        "name": en,
        "name_tr": item.get("tr_name") or None,
        "category": cat,
        "description": (item.get("en_description") or item.get("tr_description") or "").strip(),
        "image": image,
        "lat": float(item["latitude"]),
        "lng": float(item["longitude"]),
        "rating": 4.5,
        "xp_reward": 40,
        "kultur_yolu": True,
        "ky_seq": n,
        "source": "kultur_yolu_canonical",
        "metadata": {
            "tr_description": item.get("tr_description"),
            "raw_categories": item.get("categories"),
        },
    }


def resolve_quest_pois(rows: list[dict], hints: list[str]) -> list[str]:
    """Match each hint to a POI id by substring match against en/tr names."""
    out: list[str] = []
    for hint in hints:
        h = hint.lower()
        for r in rows:
            if h in r["name"].lower() or (r.get("name_tr") and h in r["name_tr"].lower()):
                if r["id"] not in out:
                    out.append(r["id"])
                break
    return out


def main():
    dry = "--dry-run" in sys.argv
    if not DATA.exists():
        print(f"❌ Missing source file: {DATA}")
        sys.exit(1)
    data = json.loads(DATA.read_text())
    rows = [build_row(x) for x in data]
    rows = [r for r in rows if r["lat"] is not None and r["lng"] is not None]
    print(f"📥 {len(rows)} places loaded from {DATA.name}")

    # Resolve quest remaps from the new rows
    remap_resolved: dict[str, list[str]] = {}
    for qid, hints in QUEST_REMAPS.items():
        resolved = resolve_quest_pois(rows, hints)
        remap_resolved[qid] = resolved
        if len(resolved) < len(hints):
            print(f"  ⚠️  {qid}: matched {len(resolved)}/{len(hints)} hints — hints: {hints}")
        else:
            print(f"  ✅ {qid}: {len(resolved)} POIs")

    if dry:
        from collections import Counter
        print("\nCategory breakdown:")
        for cat, n in Counter(r["category"] for r in rows).items():
            print(f"  {cat}: {n}")
        print("\nSample remapped quest poi_ids:")
        for qid, ids in remap_resolved.items():
            print(f"  {qid} → {ids}")
        return

    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        sys.exit(1)

    # 1) Wipe ALL Gaziantep POIs
    del_res = sb.table("pois").delete().eq("city_id", CITY_ID).execute()
    print(f"🗑️  Deleted {len(del_res.data or [])} existing Gaziantep POIs")

    # 2) Insert canonical 97
    for i in range(0, len(rows), 100):
        batch = rows[i : i + 100]
        sb.table("pois").upsert(batch, on_conflict="id").execute()
    print(f"✅ Inserted {len(rows)} places")

    # 3) Update quest poi_ids
    QUEST_META_UPDATES = {
        # q-gaz-2 is repointed from "İmam Çağdaş Restaurant" to "Emine Göğüş Culinary Museum"
        # → update its title/description to match the new POI.
        "q-gaz-2": {
            "title": "Culinary Heritage",
            "description": "Discover Gaziantep's UNESCO-recognized cuisine at Emine Göğüş Mutfak Müzesi.",
            "category": "museum",
            "badge_name": "Cuisine Curator",
        },
    }
    for qid, new_ids in remap_resolved.items():
        if not new_ids:
            print(f"  ⏭️  {qid}: no matches, leaving unchanged")
            continue
        update_payload = {"poi_ids": new_ids, **QUEST_META_UPDATES.get(qid, {})}
        sb.table("quests").update(update_payload).eq("id", qid).execute()
        print(f"  ✅ {qid} updated → poi_ids={new_ids}")

    # 4) Refresh cities.poi_count
    total = sb.table("pois").select("id", count="exact", head=True) \
        .eq("city_id", CITY_ID).execute().count
    sb.table("cities").update({"poi_count": total}).eq("id", CITY_ID).execute()
    print(f"\n📊 Gaziantep total POIs now: {total}")
    print("🎉 Swap complete.")


if __name__ == "__main__":
    main()
