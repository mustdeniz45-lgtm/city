"""Incremental Gaziantep update — June 2026.

Applies two non-destructive updates to the Supabase data WITHOUT touching GPS:

1. **Dishes** — Refresh `description` for the 21 Gaziantep dishes by matching
   against `gaziantep_yemekleri.json`. New EN text from the user replaces the
   older auto-generated descriptions.

2. **Places (Kültür Yolu)** — Refresh `metadata.raw_categories` for the 95 KY
   POIs from `kultur_yolu_v2.xlsx`. New richer subcategories
   (e.g. `historic,mosques`, `historic,hans`, `historic,bath`) replace the
   single-token list. **GPS, name, description, image_url are NOT touched.**

Usage:
    cd /app/backend && python migrate_update_v2.py
    cd /app/backend && python migrate_update_v2.py --dry-run
"""
from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

from dotenv import load_dotenv
from openpyxl import load_workbook

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

ROOT = Path(__file__).parent
DISHES_PATH = ROOT / "seed_assets" / "gaziantep_yemekleri.json"
XLSX_PATH = ROOT / "seed_assets" / "kultur_yolu_v2.xlsx"
CITY_ID = "gaziantep"


def normalize(s: str) -> str:
    """Lowercase + strip diacritics — useful for fuzzy name matching."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def update_dishes(dry: bool) -> int:
    sb = get_supabase()
    if not DISHES_PATH.exists():
        print(f"❌ Missing {DISHES_PATH}")
        return 0
    new_dishes = json.loads(DISHES_PATH.read_text(encoding="utf-8"))
    print(f"\n🍽️  Loaded {len(new_dishes)} dishes from {DISHES_PATH.name}")

    if sb is None:
        print("❌ Supabase not configured")
        return 0

    existing = sb.table("dishes").select("*").eq("city_id", CITY_ID).limit(200).execute().data or []
    print(f"   DB has {len(existing)} existing Gaziantep dishes")
    by_norm = {normalize(d["name"]): d for d in existing}
    # Find the highest dish-gaz-NN id so we can generate IDs for new ones
    existing_ids = [d["id"] for d in existing if d["id"].startswith("dish-gaz-")]
    next_n = 1
    for did in existing_ids:
        try:
            n = int(did.rsplit("-", 1)[-1])
            next_n = max(next_n, n + 1)
        except (ValueError, IndexError):
            pass

    DEFAULT_IMG = "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=70"

    updated = inserted = skipped = 0
    for nd in new_dishes:
        name = (nd.get("isim") or "").strip()
        new_desc = (nd.get("aciklama") or "").strip()
        if not name or not new_desc:
            continue
        key = normalize(name)
        match = by_norm.get(key)
        if not match:
            # Fallback: substring match
            for k, v in by_norm.items():
                if k and (key in k or k in key):
                    match = v
                    break

        if not match:
            # INSERT new dish
            new_id = f"dish-gaz-{next_n:02d}"
            next_n += 1
            row = {
                "id": new_id,
                "city_id": CITY_ID,
                "name": name,
                "description": new_desc,
                "image": DEFAULT_IMG,
                "tags": ["antep", "traditional"],
            }
            if dry:
                print(f"   ➕ [DRY] insert new dish: {name} ({new_id})")
            else:
                sb.table("dishes").insert(row).execute()
                print(f"   ➕ inserted new dish: {name} ({new_id})")
            inserted += 1
            continue

        if (match.get("description") or "").strip() == new_desc:
            skipped += 1
            continue
        if dry:
            print(f"   • [DRY] {name}: would update description ({len(new_desc)} chars)")
        else:
            sb.table("dishes").update({"description": new_desc}).eq("id", match["id"]).execute()
            print(f"   ✅ {name}: description refreshed")
        updated += 1
    print(f"\n   → {updated} updated, {inserted} inserted, {skipped} already current")
    return updated + inserted


def update_place_categories(dry: bool) -> int:
    sb = get_supabase()
    if not XLSX_PATH.exists():
        print(f"❌ Missing {XLSX_PATH}")
        return 0
    wb = load_workbook(XLSX_PATH)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    items = [dict(zip(header, r)) for r in rows[1:]]
    print(f"\n🏛️  Loaded {len(items)} places from {XLSX_PATH.name}")

    if sb is None:
        print("❌ Supabase not configured")
        return 0

    existing = sb.table("pois").select("id,name,name_tr,metadata,category,ky_seq") \
        .eq("city_id", CITY_ID).limit(2000).execute().data or []
    print(f"   DB has {len(existing)} existing Gaziantep POIs")

    # Index existing by normalized EN name (primary) + TR name (fallback)
    by_en = {normalize(p.get("name") or ""): p for p in existing if p.get("name")}
    by_tr = {normalize(p.get("name_tr") or ""): p for p in existing if p.get("name_tr")}
    by_seq = {p.get("ky_seq"): p for p in existing if p.get("ky_seq")}

    updated = skipped = unmatched = 0
    for it in items:
        n_seq = it.get("N")
        en = (it.get("EN_NAME") or "").strip()
        tr = (it.get("TR_NAME") or "").strip()
        new_cats_raw = (it.get("CATEGORIES") or "").strip()
        if not new_cats_raw:
            continue
        # Auto-correct common typos in the source spreadsheet
        new_cats_raw = new_cats_raw.replace("mosqeus", "mosques")
        new_cats = [c.strip() for c in new_cats_raw.split(",") if c.strip()]

        # Match by ky_seq (most reliable), then EN name, then TR name
        match = by_seq.get(n_seq) or by_en.get(normalize(en)) or by_tr.get(normalize(tr))
        if not match:
            print(f"   ⚠️  no DB match for place N={n_seq} {en}")
            unmatched += 1
            continue

        meta = dict(match.get("metadata") or {})
        old_cats = meta.get("raw_categories") or []
        if old_cats == new_cats:
            skipped += 1
            continue

        meta["raw_categories"] = new_cats
        if dry:
            print(f"   • [DRY] N={n_seq} {en[:40]:40s} : {','.join(old_cats):28s} -> {','.join(new_cats)}")
        else:
            sb.table("pois").update({"metadata": meta}).eq("id", match["id"]).execute()
        updated += 1

    print(f"\n   → {updated} updated, {skipped} already current, {unmatched} unmatched")
    return updated


def main():
    dry = "--dry-run" in sys.argv
    if dry:
        print("🔵 DRY RUN — no DB writes")

    n1 = update_dishes(dry)
    n2 = update_place_categories(dry)

    print("\n🎉 Done.")
    print(f"   Dishes updated: {n1}")
    print(f"   Places category-updated: {n2}")


if __name__ == "__main__":
    main()
