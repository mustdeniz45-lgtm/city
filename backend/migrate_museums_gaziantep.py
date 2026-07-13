"""Adds curated Gaziantep museums (non-Kültür Yolu) to the `pois` table.

Reads `seed_assets/museums_gaziantep.json` and upserts each item as a
POI with `category = "museum"`. Idempotent — safe to re-run after edits.

Input format uses a slightly different key set than restaurants/services
(`number`, `eng_name`, `eng_description`, `google_reviews` as a formatted
string, `xp_reward` as a "40xp" string, etc.). Two tiny parsers handle
the conversion.

Run:
    cd /app/backend && python migrate_museums_gaziantep.py
"""
import json
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

ROOT = Path(__file__).parent
DATA = ROOT / "seed_assets" / "museums_gaziantep.json"
CITY_ID = "gaziantep"
FALLBACK_IMG = "https://images.unsplash.com/photo-1565060169186-65f5fad44e21?w=600&q=70"

# `google_reviews` arrives as free-form strings like "4.5 (3200+ reviews)".
# We extract the leading rating and the trailing count so the row can
# populate `rating` + `metadata.review_count` in the canonical shape.
_REVIEW_RE = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)")
_COUNT_RE = re.compile(r"([0-9]+)\+?\s*review", re.IGNORECASE)


def parse_reviews(raw: str | None) -> tuple[float | None, int | None]:
    if not raw:
        return None, None
    rating = None
    count = None
    m = _REVIEW_RE.search(raw)
    if m:
        try: rating = float(m.group(1))
        except ValueError: pass
    m = _COUNT_RE.search(raw)
    if m:
        try: count = int(m.group(1))
        except ValueError: pass
    return rating, count


def parse_xp(raw: str | int | None, default: int = 40) -> int:
    """Accept '40xp', '40 XP', 40, '40' — anything sensible."""
    if raw is None: return default
    if isinstance(raw, int): return raw
    m = re.search(r"(\d+)", str(raw))
    return int(m.group(1)) if m else default


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "museum"


def build_row(item: dict) -> dict:
    n = int(item.get("number") or item.get("n") or 0)
    en = (item.get("eng_name") or item.get("en_name") or item.get("tr_name") or "Museum").strip()
    image = (item.get("image_url") or "").strip() or FALLBACK_IMG
    rating, review_count = parse_reviews(item.get("google_reviews"))
    xp = parse_xp(item.get("xp_reward"), default=40)
    return {
        "id": f"poi-gaz-mus-{n:03d}-{slugify(en)}",
        "city_id": CITY_ID,
        "name": en,
        "name_tr": item.get("tr_name") or None,
        "category": "museum",
        "description": (item.get("eng_description") or item.get("en_description")
                        or item.get("tr_description") or "").strip(),
        "image": image,
        "lat": float(item["latitude"]),
        "lng": float(item["longitude"]),
        "rating": rating if rating is not None else 4.5,
        "xp_reward": xp,
        "kultur_yolu": False,
        "ky_seq": None,
        "source": "museums_canonical",
        "metadata": {
            "tr_description": item.get("tr_description"),
            "raw_categories": item.get("categories"),
            "address": (item.get("address") or "").strip() or None,
            "plus_code": (item.get("plus_code") or "").strip() or None,
            "phone": (item.get("phone_number") or item.get("phone") or "").strip() or None,
            "google_rating": rating,
            "review_count": review_count,
            "working_hours": item.get("open_hours") or item.get("working_hours"),
            "website": (item.get("website") or "").strip() or None,
            "entry_fee": item.get("entry_fee_museum_card_accepted"),
            "status": item.get("status") or "open",
        },
    }


def main():
    if not DATA.exists():
        print(f"❌ Missing source file: {DATA}")
        sys.exit(1)
    items = json.loads(DATA.read_text())
    rows = [build_row(x) for x in items]
    rows = [r for r in rows if r["lat"] is not None and r["lng"] is not None]
    print(f"📥 {len(rows)} museum POIs ready")

    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        sys.exit(1)

    for i in range(0, len(rows), 50):
        batch = rows[i : i + 50]
        sb.table("pois").upsert(batch, on_conflict="id").execute()
    print(f"✅ Upserted {len(rows)} museum POIs")

    # Refresh city poi_count
    total = sb.table("pois").select("id", count="exact", head=True) \
        .eq("city_id", CITY_ID).execute().count
    sb.table("cities").update({"poi_count": total}).eq("id", CITY_ID).execute()
    print(f"\n📊 Gaziantep total POIs now: {total}")
    print("🎉 Done.")


if __name__ == "__main__":
    main()
