"""Swap the Gaziantep Kültür Yolu (Cultural Route) POI dataset for the
user-provided v2 JSON. Run once.

  python migrate_kultur_yolu_v2.py /tmp/ky_new.json [--dry-run]

Behavior:
 1. Deletes every row in `pois` where city_id='gaziantep' AND kultur_yolu=true.
 2. Inserts the new 97 rows from the JSON, all marked kultur_yolu=true.
 3. Updates cities.poi_count for gaziantep.
"""
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

CITY_ID = "gaziantep"

# Map JSON `categories` to the app's canonical category enum.
# (Pick the FIRST matching specific category in priority order.)
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


def pick_category(cats: list[str]) -> str:
    cats = [c.lower() for c in (cats or [])]
    for key in CATEGORY_PRIORITY:
        if key in cats:
            return CATEGORY_MAP[key]
    return "must-see"


def build_row(item: dict) -> dict:
    n = int(item.get("n") or 0)
    cat = pick_category(item.get("categories") or [])
    image = item.get("image_url") or FALLBACK_IMAGES[cat]
    return {
        "id": f"poi-gaz-ky2-{n:03d}",
        "city_id": CITY_ID,
        "name": (item.get("en_name") or item.get("tr_name") or "Unnamed").strip(),
        "name_tr": (item.get("tr_name") or None),
        "category": cat,
        "description": (item.get("en_description") or item.get("tr_description") or "").strip(),
        "image": image,
        "lat": float(item.get("latitude")),
        "lng": float(item.get("longitude")),
        "rating": 4.5,
        "xp_reward": 40,
        "kultur_yolu": True,
        "ky_seq": n,
        "source": "kultur_yolu_v2",
        "metadata": {
            "tr_description": item.get("tr_description"),
            "raw_categories": item.get("categories"),
        },
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python migrate_kultur_yolu_v2.py <path-to-json> [--dry-run]")
        sys.exit(1)
    path = Path(sys.argv[1])
    dry = "--dry-run" in sys.argv

    data = json.loads(path.read_text())
    print(f"📥 Loaded {len(data)} items from {path}")

    rows = [build_row(x) for x in data]
    # Filter out items lacking coordinates (defensive)
    rows = [r for r in rows if r["lat"] is not None and r["lng"] is not None]
    print(f"   → {len(rows)} rows ready to upsert")

    if dry:
        from collections import Counter
        print("\nCategory breakdown:")
        for cat, n in Counter(r["category"] for r in rows).items():
            print(f"  {cat}: {n}")
        print("\nFirst 3 rows:")
        for r in rows[:3]:
            print(f"  [{r['id']}] {r['name']} ({r['category']}) — img={r['image'][:60]}…")
        return

    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        sys.exit(1)

    # 1) Delete existing KY POIs
    del_res = sb.table("pois") \
        .delete() \
        .eq("city_id", CITY_ID) \
        .eq("kultur_yolu", True) \
        .execute()
    print(f"🗑️  Deleted {len(del_res.data or [])} old KY POIs")

    # 2) Insert new rows
    for i in range(0, len(rows), 100):
        batch = rows[i : i + 100]
        sb.table("pois").upsert(batch, on_conflict="id").execute()
        print(f"   ✅ inserted {min(i + 100, len(rows))}/{len(rows)}")

    # 3) Refresh poi_count on cities
    total = sb.table("pois") \
        .select("id", count="exact", head=True) \
        .eq("city_id", CITY_ID).execute().count
    sb.table("cities").update({"poi_count": total}).eq("id", CITY_ID).execute()
    print(f"\n📊 Gaziantep total POIs: {total}")
    print("🎉 Migration complete.")


if __name__ == "__main__":
    main()
