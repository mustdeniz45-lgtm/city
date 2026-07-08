"""Restrict Kültür Yolu to the canonical 53 places — July 2026.

Per the user's spec, the Kültür Yolu badge, purple map pins, and the
"Kültür Yolu Champion" quest should only apply to the first 53 places
(seq 1 → 53, Panorama Museum → National Resistance Museum).

Places with `ky_seq > 53` (there are 43 of them — Zeugma Mosaic Museum,
Rumkale Fortress, Ravanda Castle, Yesemek Open-Air Museum, the newer
mosques, etc.) get:
  * `kultur_yolu = False`
  * `ky_seq = null`

They remain in the DB as regular POIs (their category — landmark, museum,
mosque, nature, historic — is preserved) so no data is lost, and any
`raw_categories` metadata is retained.

Usage:
    cd /app/backend && python migrate_ky_53_only.py [--dry-run]
"""
from __future__ import annotations

import sys

from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

CITY_ID = "gaziantep"
CANONICAL_MAX_SEQ = 53


def main(dry_run: bool = False):
    sb = get_supabase()
    existing = (
        sb.table("pois")
        .select("id,name,ky_seq,kultur_yolu,metadata")
        .eq("city_id", CITY_ID)
        .not_.is_("ky_seq", "null")
        .order("ky_seq")
        .limit(2000)
        .execute()
        .data
        or []
    )
    print(f"Found {len(existing)} POIs with ky_seq")
    to_reset = [p for p in existing if (p.get("ky_seq") or 0) > CANONICAL_MAX_SEQ]
    keep = len(existing) - len(to_reset)
    print(f"Keep KY:   {keep}")
    print(f"Reset KY:  {len(to_reset)}")

    for p in to_reset:
        # Strip the KY marker from raw_categories too so quests / UI don't
        # keep thinking of these places as Kültür Yolu.
        md = dict(p.get("metadata") or {})
        raw = md.get("raw_categories") or []
        if isinstance(raw, list):
            md["raw_categories"] = [c for c in raw if not str(c).lower().startswith("kültür")]

        patch = {"kultur_yolu": False, "ky_seq": None, "metadata": md}
        if dry_run:
            print(f"[dry] reset  #{p['ky_seq']:>3}  {p['name']}")
        else:
            sb.table("pois").update(patch).eq("id", p["id"]).execute()

    print(f"\n✓ {'Would reset' if dry_run else 'Reset'}: {len(to_reset)}")


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    main(dry_run=dry)
