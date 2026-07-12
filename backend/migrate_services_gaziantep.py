"""Adds the 8 user-provided Gaziantep service POIs (parkings, drinking
fountains, public toilets) to the `pois` table.

Reads `seed_assets/services_gaziantep.json` and upserts each item as a
POI with `category` = its `category_manual` (parking / drinking_fountain
/ public_toilet). The Services filter chip in the app matches these via
`metadata.raw_categories` (see `repo.py::_FILTER_TO_RAW["services"]`).

Idempotent — safe to run again after edits.

Run once:
    cd /app/backend && python migrate_services_gaziantep.py
"""
import json
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

ROOT = Path(__file__).parent
DATA = ROOT / "seed_assets" / "services_gaziantep.json"
CITY_ID = "gaziantep"

# Category-specific fallback hero images used when the source `image_url`
# is empty. We pick generic Unsplash shots that visually communicate the
# amenity without any place-specific branding.
FALLBACK_IMG = {
    "parking":           "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&q=70",  # multi-storey car park
    "drinking_fountain": "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&q=70",     # public fountain
    "public_toilet":     "https://images.unsplash.com/photo-1585155770447-2f66e2a397b5?w=600&q=70",  # WC sign
}
DEFAULT_FALLBACK = "https://images.unsplash.com/photo-1517090504586-fde19ea6066f?w=600&q=70"

# Services are utility waypoints, not primary sights — a small XP prevents
# leaderboard grinding via toilet check-ins while still rewarding useful
# navigation aids.
XP_REWARD = 15


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "service"


def build_row(item: dict) -> dict:
    n = int(item.get("n") or 0)
    en = (item.get("en_name") or item.get("tr_name") or "Service").strip()
    manual = (item.get("category_manual") or "").strip().lower() or "service"
    image = (item.get("image_url") or "").strip() or FALLBACK_IMG.get(manual, DEFAULT_FALLBACK)
    rating = item.get("google_rating") or 4.0
    return {
        "id": f"poi-gaz-svc-{n:03d}-{slugify(en)}",
        "city_id": CITY_ID,
        "name": en,
        "name_tr": item.get("tr_name") or None,
        # Persist the granular subtype (parking / drinking_fountain /
        # public_toilet) on the POI row itself so the UI can render an
        # accurate kicker without a JOIN.
        "category": manual,
        "description": (item.get("en_description") or item.get("tr_description") or "").strip(),
        "image": image,
        "lat": float(item["latitude"]),
        "lng": float(item["longitude"]),
        "rating": float(rating) if rating else 4.0,
        "xp_reward": XP_REWARD,
        "kultur_yolu": False,
        "ky_seq": None,
        "source": "services_canonical",
        "metadata": {
            "tr_description": item.get("tr_description"),
            # `raw_categories` is the source of truth the Services filter
            # inspects — see repo._FILTER_TO_RAW["services"].
            "raw_categories": item.get("categories") or [manual],
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
    print(f"📥 {len(rows)} service POIs ready")

    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        sys.exit(1)

    for i in range(0, len(rows), 50):
        batch = rows[i : i + 50]
        sb.table("pois").upsert(batch, on_conflict="id").execute()
    print(f"✅ Upserted {len(rows)} service POIs")

    # Refresh city poi_count
    total = sb.table("pois").select("id", count="exact", head=True) \
        .eq("city_id", CITY_ID).execute().count
    sb.table("cities").update({"poi_count": total}).eq("id", CITY_ID).execute()
    print(f"\n📊 Gaziantep total POIs now: {total}")
    print("🎉 Done.")


if __name__ == "__main__":
    main()
