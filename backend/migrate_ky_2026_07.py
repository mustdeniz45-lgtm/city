"""Kültür Yolu enrichment migration — July 2026.

Merges rich metadata for the 96 Kültür Yolu POIs from
`kultur_yolu_mekanlari_güncel.json` into Supabase.

For each POI matched by `ky_seq == json.number` the script updates:
  * `xp_reward` (parsed from e.g. `"60xp"` → 60)
  * `rating` (parsed from `"4.8 (4965 reviews)"` → 4.8)
  * `metadata.address`, `metadata.plus_code`
  * `metadata.open_hours`, `metadata.website`, `metadata.phone_number`
  * `metadata.google_reviews`, `metadata.review_count`
  * `metadata.entry_fee_museum_card_accepted`, `metadata.status`
  * `metadata.raw_categories` (replaces older single-token list)
  * `metadata.tr_description` and `metadata.eng_description`
  * Refreshes top-level `description` from `eng_description` when the current
    description is short/missing.

Nothing else is touched — GPS, names, images stay put unless explicitly enriched.

Usage:
    cd /app/backend && python migrate_ky_2026_07.py [--dry-run]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

CITY_ID = "gaziantep"
# The uploaded artifact URL (user provided).
SOURCE_URL = (
    "https://customer-assets.emergentagent.com/job_local-explorer-game/"
    "artifacts/znj52g2e_kultur_yolu_mekanlari_g%C3%BCncel.json"
)
LOCAL_FALLBACK = Path("/tmp/ky.json")

# --- Parsers -----------------------------------------------------------------


def parse_xp(s):
    """`"60xp"` → 60. Returns None if the value is malformed."""
    if not s:
        return None
    m = re.search(r"(\d+)", str(s))
    return int(m.group(1)) if m else None


def parse_rating(s):
    """`"4.8 (4965 reviews)"` → (4.8, 4965). Missing parts → None."""
    if not s:
        return (None, None)
    rating = None
    count = None
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)", str(s))
    if m:
        try:
            rating = float(m.group(1))
        except ValueError:
            rating = None
    m2 = re.search(r"\(([\d,]+)\s+review", str(s))
    if m2:
        try:
            count = int(m2.group(1).replace(",", ""))
        except ValueError:
            count = None
    return (rating, count)


def load_source() -> list[dict]:
    """Pull the JSON from the artifact URL, falling back to /tmp/ky.json."""
    try:
        r = httpx.get(SOURCE_URL, timeout=30.0)
        r.raise_for_status()
        return r.json()["places"]
    except Exception as e:
        print(f"⚠️  Remote fetch failed ({e}); falling back to {LOCAL_FALLBACK}")
        return json.loads(LOCAL_FALLBACK.read_text(encoding="utf-8"))["places"]


# --- Main --------------------------------------------------------------------


def main(dry_run: bool = False):
    sb = get_supabase()

    places = load_source()
    print(f"Source: {len(places)} KY places")

    existing = (
        sb.table("pois")
        .select("id,name,ky_seq,rating,xp_reward,description,metadata")
        .eq("city_id", CITY_ID)
        .not_.is_("ky_seq", "null")
        .limit(2000)
        .execute()
        .data
        or []
    )
    by_seq = {p["ky_seq"]: p for p in existing}
    print(f"DB   : {len(existing)} KY POIs found (by ky_seq)")

    updated = 0
    skipped = 0
    missing = []

    for src in places:
        seq = src["number"]
        target = by_seq.get(seq)
        if not target:
            missing.append(seq)
            continue

        cur_meta = target.get("metadata") or {}
        rating, review_count = parse_rating(src.get("google_reviews"))
        xp = parse_xp(src.get("xp_reward"))

        # Merge metadata — keep any keys we don't overwrite.
        new_meta = dict(cur_meta)
        new_meta.update({
            "address":        src.get("address") or cur_meta.get("address"),
            "plus_code":      src.get("plus_code") or cur_meta.get("plus_code"),
            "open_hours":     src.get("open_hours"),
            "website":        src.get("website"),
            "phone_number":   src.get("phone_number"),
            "google_reviews": src.get("google_reviews"),
            "review_count":   review_count,
            "entry_fee_museum_card_accepted":
                              src.get("entry_fee_museum_card_accepted"),
            "status":         src.get("status") or "open",
            "raw_categories": src.get("categories") or cur_meta.get("raw_categories"),
            "tr_description": src.get("tr_description") or cur_meta.get("tr_description"),
            "eng_description": src.get("eng_description") or cur_meta.get("eng_description"),
        })
        # Drop keys with None so we don't clutter the JSONB blob.
        new_meta = {k: v for k, v in new_meta.items() if v not in (None, "")}

        patch = {"metadata": new_meta}
        if rating is not None:
            patch["rating"] = rating
        if xp is not None:
            patch["xp_reward"] = xp

        # Refresh top-level description only when current is short/generic —
        # gives users the richer new English blurb.
        cur_desc = (target.get("description") or "").strip()
        new_desc = (src.get("eng_description") or "").strip()
        if new_desc and (len(cur_desc) < 40 or cur_desc == new_desc):
            patch["description"] = new_desc

        if dry_run:
            print(f"[dry] #{seq:>3} {target['name'][:40]:40}  "
                  f"xp:{target.get('xp_reward')}→{xp}  "
                  f"rating:{target.get('rating')}→{rating}")
        else:
            sb.table("pois").update(patch).eq("id", target["id"]).execute()
        updated += 1

    print(f"\n✓ Updated: {updated}")
    if missing:
        print(f"⚠️  Not found in DB (skip): {len(missing)} → {missing[:20]}")
    print(f"⚠️  Skipped: {skipped}")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    main(dry_run=dry)
