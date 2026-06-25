"""Adds the 21 user-provided restaurants to the pois table for Gaziantep.

Reads `seed_assets/restaurants_gaziantep.json` and upserts each item as a
POI with category=restaurant. Rich extras (phone, hours, google rating, etc.)
go into metadata.

Run once:
    cd /app/backend && python migrate_restaurants_gaziantep.py
"""
import json
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

ROOT = Path(__file__).parent
DATA = ROOT / "seed_assets" / "restaurants_gaziantep.json"
CITY_ID = "gaziantep"
FALLBACK_IMG = "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=70"


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "restaurant"


def build_row(item: dict) -> dict:
    n = int(item.get("n") or item.get("id") or 0)
    en = (item.get("en_name") or item.get("tr_name") or "Restaurant").strip()
    image = (item.get("image_url") or "").strip() or FALLBACK_IMG
    rating = item.get("google_rating") or 4.5
    return {
        "id": f"poi-gaz-rest-{n:03d}-{slugify(en)}",
        "city_id": CITY_ID,
        "name": en,
        "name_tr": item.get("tr_name") or None,
        "category": "restaurant",
        "description": (item.get("en_description") or item.get("tr_description") or "").strip(),
        "image": image,
        "lat": float(item["latitude"]),
        "lng": float(item["longitude"]),
        "rating": float(rating) if rating else 4.5,
        "xp_reward": 35,
        "kultur_yolu": False,
        "ky_seq": None,
        "source": "restaurants_canonical",
        "metadata": {
            "tr_description": item.get("tr_description"),
            "raw_categories": item.get("categories"),
            "address": (item.get("address") or "").strip() or None,
            "plus_code": (item.get("google_plus_code") or "").strip() or None,
            "phone": (item.get("phone") or "").strip() or None,
            "google_rating": rating,
            "review_count": item.get("review_count"),
            "working_hours": item.get("working_hours"),
            "google_maps_url": item.get("google_maps_url"),
            "specialty": item.get("specialty"),
        },
    }


def main():
    if not DATA.exists():
        print(f"❌ Missing source file: {DATA}")
        sys.exit(1)
    items = json.loads(DATA.read_text())
    rows = [build_row(x) for x in items]
    rows = [r for r in rows if r["lat"] is not None and r["lng"] is not None]
    print(f"📥 {len(rows)} restaurants ready")

    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        sys.exit(1)

    for i in range(0, len(rows), 50):
        batch = rows[i : i + 50]
        sb.table("pois").upsert(batch, on_conflict="id").execute()
    print(f"✅ Upserted {len(rows)} restaurant POIs")

    # Refresh city poi_count
    total = sb.table("pois").select("id", count="exact", head=True) \
        .eq("city_id", CITY_ID).execute().count
    sb.table("cities").update({"poi_count": total}).eq("id", CITY_ID).execute()
    print(f"\n📊 Gaziantep total POIs now: {total}")
    print("🎉 Done.")


if __name__ == "__main__":
    main()
