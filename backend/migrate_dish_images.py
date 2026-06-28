"""Map Supabase Storage `foods` bucket files to Gaziantep dishes and update
each dish's `image` URL to point at the public storage URL.

Usage:
    cd /app/backend && python migrate_dish_images.py
    cd /app/backend && python migrate_dish_images.py --dry-run
"""
from __future__ import annotations

import re
import sys
import unicodedata
import urllib.parse
from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

CITY_ID = "gaziantep"
BUCKET = "foods"


def normalize(s: str) -> str:
    """Lowercase + map Turkish chars + strip diacritics + collapse non-alphanumeric."""
    if not s:
        return ""
    # Turkish letter map (combining char stripping alone misses ı/ş/ğ/ç)
    TR = str.maketrans({
        "ı": "i", "İ": "i", "ş": "s", "Ş": "s",
        "ğ": "g", "Ğ": "g", "ç": "c", "Ç": "c",
        "ö": "o", "Ö": "o", "ü": "u", "Ü": "u",
    })
    s = s.translate(TR)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def tokens(s: str) -> set[str]:
    return set(normalize(s).split())


def public_url(name: str) -> str:
    encoded = urllib.parse.quote(name)
    return (
        "https://qhnmbctcdetpjsgjkzrw.supabase.co/storage/v1/object/public/"
        f"{BUCKET}/{encoded}"
    )


# Manual aliases for DB names that don't have a matching file directly.
# Key = normalized DB dish name → token set to use for matching against files.
ALIASES = {
    # No matching file exists; fall back to a related kebab image
    "antep kebabi":     "kusleme kebap",   # Antep kebabı (raw) → use küşleme kebap image
    "patlican kebabi":  "ali nazik kebabi",  # Eggplant kebab → ali nazik is also eggplant-based
}


def best_file_match(dish_name: str, file_names: list[str]) -> str | None:
    """Pick the file whose normalized name best matches dish_name."""
    nd = normalize(dish_name)
    if nd in ALIASES:
        nd = ALIASES[nd]
    dish_toks = set(nd.split())
    best: tuple[int, str] | None = None  # (score, filename)
    for f in file_names:
        if f.startswith("."):
            continue
        nf = normalize(f.rsplit(".", 1)[0])
        file_toks = set(nf.split())
        # Exact or substring match wins immediately
        if nd == nf:
            return f
        # Substring containment
        if nd and (nd in nf or nf in nd):
            score = 100 + min(len(nd), len(nf))
            if not best or score > best[0]:
                best = (score, f)
            continue
        # Token-overlap fallback
        overlap = len(dish_toks & file_toks)
        if overlap >= 1:
            score = overlap * 10
            if not best or score > best[0]:
                best = (score, f)
    return best[1] if best else None


def main():
    dry = "--dry-run" in sys.argv
    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        return

    files = sb.storage.from_(BUCKET).list("", {"limit": 200})
    file_names = [f["name"] for f in files if not f["name"].startswith(".")]
    print(f"🗄️  Bucket `{BUCKET}`: {len(file_names)} files")

    dishes = sb.table("dishes").select("*").eq("city_id", CITY_ID).limit(200).execute().data or []
    print(f"🍽️  DB has {len(dishes)} Gaziantep dishes")

    used = set()
    updated = skipped = unmatched = 0
    for d in dishes:
        match = best_file_match(d["name"], file_names)
        if not match:
            print(f"  ⚠️  no match for '{d['name']}'")
            unmatched += 1
            continue
        new_url = public_url(match)
        if (d.get("image") or "") == new_url:
            print(f"  · {d['name']:24s} already → {match}")
            skipped += 1
            used.add(match)
            continue
        if dry:
            print(f"  • [DRY] {d['name']:24s} -> {match}")
        else:
            sb.table("dishes").update({"image": new_url}).eq("id", d["id"]).execute()
            print(f"  ✅ {d['name']:24s} -> {match}")
        updated += 1
        used.add(match)

    unused = [f for f in file_names if f not in used]
    if unused:
        print(f"\nℹ️  {len(unused)} unused file(s): {unused}")

    print(f"\n🎉 Done. Updated: {updated} · Skipped: {skipped} · Unmatched: {unmatched}")


if __name__ == "__main__":
    main()
