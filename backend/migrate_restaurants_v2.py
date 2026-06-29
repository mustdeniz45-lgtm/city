"""Refresh Gaziantep restaurants from gaziantep_restoranlar.json.

For each restaurant in the file:
  • If a matching POI exists (by Turkish-normalized EN/TR name), UPDATE
    description, image, lat/lng, rating, and the rich metadata fields.
  • If no match, INSERT a new restaurant POI.

POIs in the DB that are NOT in the new file are LEFT UNTOUCHED.

Usage:
    cd /app/backend && python migrate_restaurants_v2.py
    cd /app/backend && python migrate_restaurants_v2.py --dry-run
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

CITY_ID = "gaziantep"
PATH = Path("/tmp/artifacts/restaurants_new.json")
DEFAULT_XP = 35


def normalize(s: str) -> str:
    if not s:
        return ""
    TR = str.maketrans({
        "ı": "i", "İ": "i", "ş": "s", "Ş": "s",
        "ğ": "g", "Ğ": "g", "ç": "c", "Ç": "c",
        "ö": "o", "Ö": "o", "ü": "u", "Ü": "u",
    })
    s = s.translate(TR)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", normalize(s)).strip("-")[:60]


def build_metadata(r: dict) -> dict:
    """Compose the canonical metadata blob stored on the POI row."""
    return {
        "phone": r.get("phone") or "",
        "address": r.get("address") or "",
        "plus_code": r.get("google_plus_code") or "",
        "specialty": r.get("specialty") or "",
        "review_count": r.get("review_count") or 0,
        "google_rating": r.get("google_rating") or 0,
        "working_hours": r.get("working_hours") or "",
        "raw_categories": r.get("categories") or ["restaurant/cafe"],
        "tr_description": r.get("tr_description") or "",
        "google_maps_url": r.get("google_maps_url") or "",
    }


def main():
    dry = "--dry-run" in sys.argv
    if not PATH.exists():
        print(f"❌ Missing {PATH}")
        return
    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        return

    new_rows = json.loads(PATH.read_text(encoding="utf-8"))
    print(f"📄 Loaded {len(new_rows)} restaurants from {PATH.name}")

    existing = sb.table("pois").select("*").eq("city_id", CITY_ID).eq("category", "restaurant").limit(200).execute().data or []
    print(f"🏛️  DB has {len(existing)} restaurant POIs\n")

    by_en = {normalize(p["name"]): p for p in existing}
    by_tr = {normalize(p.get("name_tr") or ""): p for p in existing if p.get("name_tr")}
    used_ids: set[str] = set()

    # Highest existing rest sequence — extend from there for new inserts
    next_seq = 22
    for p in existing:
        m = re.match(r"poi-gaz-rest-(\d+)-", p["id"])
        if m:
            next_seq = max(next_seq, int(m.group(1)) + 1)

    inserted = updated = skipped = 0
    # NOTE: We deliberately do NOT overwrite the `image` field for existing POIs.
    # The image URLs in the new JSON file (e.g. `yesemek.jpg`, `imam_cagdas.jpg`)
    # are broken placeholders — the actual bucket files use space-separated names
    # like `yesemek gaziantep kitchen.jpg`. These were already mapped correctly
    # by `migrate_place_images.py`, so we keep what's there.
    UPDATABLE_FIELDS = ("description", "lat", "lng", "rating", "name", "name_tr", "metadata")
    DEFAULT_RESTAURANT_IMG = (
        "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=70"
    )

    for r in new_rows:
        en = (r.get("en_name") or "").strip()
        tr = (r.get("tr_name") or "").strip()
        n_en = normalize(en); n_tr = normalize(tr)
        match = by_en.get(n_en) or by_tr.get(n_tr)
        if not match:
            # Fallback: substring search
            for p in existing:
                if p["id"] in used_ids: continue
                pn = normalize(p["name"]); ptr = normalize(p.get("name_tr") or "")
                if (n_en and (n_en in pn or pn in n_en)) or (n_tr and ptr and (n_tr in ptr or ptr in n_tr)):
                    match = p; break

        new_payload = {
            "name": en,
            "name_tr": tr,
            "description": (r.get("en_description") or "").strip(),
            "lat": float(r["latitude"]) if r.get("latitude") is not None else None,
            "lng": float(r["longitude"]) if r.get("longitude") is not None else None,
            "rating": round(float(r.get("google_rating") or 0)) or None,
            "metadata": build_metadata(r),
        }

        if match:
            used_ids.add(match["id"])
            diff = {k: v for k, v in new_payload.items()
                    if k in UPDATABLE_FIELDS and (match.get(k) or None) != (v or None)}
            if not diff:
                skipped += 1
                continue
            if dry:
                changed_keys = sorted(diff.keys())
                print(f"  • [DRY] update {en[:34]:34s} — fields: {changed_keys}")
            else:
                sb.table("pois").update(diff).eq("id", match["id"]).execute()
                print(f"  ✅ updated {en[:34]:34s} ({len(diff)} field(s))")
            updated += 1
        else:
            # INSERT new restaurant POI
            new_id = f"poi-gaz-rest-{next_seq:03d}-{slugify(en)}"
            next_seq += 1
            row = {
                "id": new_id,
                "city_id": CITY_ID,
                "category": "restaurant",
                "xp_reward": DEFAULT_XP,
                "kultur_yolu": False,
                "ky_seq": None,
                "source": "restaurants_canonical",
                "image": DEFAULT_RESTAURANT_IMG,
                **new_payload,
            }
            if dry:
                print(f"  ➕ [DRY] insert {en[:34]:34s} as {new_id}")
            else:
                sb.table("pois").insert(row).execute()
                print(f"  ➕ inserted {en[:34]:34s} → {new_id}")
            inserted += 1

    print(f"\n📊 Summary: {updated} updated · {inserted} inserted · {skipped} already current")
    untouched = [p for p in existing if p["id"] not in used_ids]
    if untouched:
        print(f"\nℹ️  {len(untouched)} restaurant POI(s) not in new file (left untouched):")
        for p in untouched:
            print(f"    {p['id']} — {p['name']}")


if __name__ == "__main__":
    main()
