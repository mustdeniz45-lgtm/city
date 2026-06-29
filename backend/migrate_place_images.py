"""Map Supabase Storage `places/places/*` files to Gaziantep POIs and update
each POI's `image` URL to point at the public storage URL.

Usage:
    cd /app/backend && python migrate_place_images.py
    cd /app/backend && python migrate_place_images.py --dry-run
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
BUCKET = "places"
PREFIX = "places"  # files live under places/places/*
BASE_URL = "https://qhnmbctcdetpjsgjkzrw.supabase.co/storage/v1/object/public"


def normalize(s: str) -> str:
    """Turkish-aware normalize: lowercase, ı/ş/ğ/ç/ö/ü → ASCII, strip rest."""
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
    s = re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
    return s


def public_url(name: str) -> str:
    encoded = urllib.parse.quote(name)
    return f"{BASE_URL}/{BUCKET}/{PREFIX}/{encoded}"


# Normalised file stem → expected canonical POI name hint.
# Manual fixes for files whose names diverge significantly from POI names.
MANUAL_FILE_TO_POI = {
    # bucket-filename-stem (normalized)  →  POI English name (substring match)
    "10 nisan park":                    "10 Nisan Park",
    "14 martyrs monument":              "14 Martyrs Monument",
    "aga ferruh mosque":                "Ağa",
    "alauddevle mosque":                "Alaüddevle",
    "bayaz han":                        "Boyacı Inn",  # bayaz han variant
    "botanic garden":                   "Botanical Garden",
    "copper crafting":                  "Coppersmiths Bazaar",
    "dulluk baba sanctuary":            "Dülük Baba Sanctuary",
    "duluk baba":                       "Dülük Baba / Doliche",
    "festival park":                    "Festival Park",
    "fistik park":                      "Fıstık Park",
    "gazi kosk kebap":                  "Gazi Köşk",
    "habes canyon":                     "Habeş Canyon",
    "hisva inn":                        "Hışva Inn",
    "ihsanbey mosque":                  "İhsanbey",
    "imam cagdas kebap and baklava":    "İmam Çağdaş",
    "kebapci halil usta":               "Halil Usta",
    "kokluce canyon":                   "Küklüce Canyon",
    "kozluca castel":                   "Kozluca",
    "naip hammam":                      "Naib Bath",
    "panorama museum 25 december":      "Panorama Museum 25 December",
    "pisirici kastel":                  "Pişirici Kastel",
    "sehrekustu mansions":              "Şehrekustü Mansions",
    "sirvan mosque":                    "Şirvan Mosque",
    "surp asdvadzadzin church":         "Surp",
    "tabak hammam":                     "Tabak",
    "yesemek gaziantep kitchen":        "Yesemek Gaziantep Kitchen",
    "yesemek open air museum":          "Yesemek Open Air Museum",
    "yesilvadi park":                   "Yeşilvadi Park",
    "zeugma belkis ancient city":       "Zeugma-Belkıs Ancient City",
    "zeugma mosaic museum":             "Zeugma Mosaic Museum",
    "ali ihsan gogus museum":           "Ali İhsan Göğüş",
    "boutique hotel":                   "Boutique Hotel",
    "halfeti sunken village":           "Halfeti Sunken Village",
    "huseyin pasha mosque":             "Hüseyin Pasha",
    "kale panorama":                    "Castle Panorama",
    "celebiogullari gaziantep":         "Çelebioğulları",
    "etse et sukret":                   "Etse",
    "ozikizler kunefe":                 "Özikizler",
    "sakip usta beyran":                "Sakıp",
    "ebru paper marbling":              "Ebru",
    "guven inn":                        "Güven",
    "kurkcu inn":                       "Kürkçü",
    "pursefa inn":                      "Pürsefa",
    "yuzukcu inn":                      "Yüzükçü",
}


def best_match(poi_name: str, poi_name_tr: str, file_names: list[str]) -> str | None:
    """Find best file for this POI using normalised name comparisons."""
    n_en = normalize(poi_name)
    n_tr = normalize(poi_name_tr or "")
    en_toks = set(n_en.split())
    tr_toks = set(n_tr.split())

    best: tuple[int, str] | None = None  # (score, filename)
    for f in file_names:
        stem = f.rsplit(".", 1)[0]
        nf = normalize(stem)
        file_toks = set(nf.split())

        # 1) Exact stem == EN or TR
        if nf == n_en or (n_tr and nf == n_tr):
            return f

        # 2) Manual mapping: file stem keyed to POI name hint
        hint = MANUAL_FILE_TO_POI.get(nf)
        if hint:
            h = normalize(hint)
            # All hint tokens present in EN or TR
            hint_toks = set(h.split())
            if hint_toks and (hint_toks.issubset(en_toks) or (tr_toks and hint_toks.issubset(tr_toks))):
                score = 200 + len(hint_toks)
                if not best or score > best[0]:
                    best = (score, f)
                continue

        # 3) Substring containment in either direction
        if n_en and (n_en in nf or nf in n_en):
            score = 100 + min(len(n_en), len(nf))
            if not best or score > best[0]:
                best = (score, f)
            continue
        if n_tr and (n_tr in nf or nf in n_tr):
            score = 95 + min(len(n_tr), len(nf))
            if not best or score > best[0]:
                best = (score, f)
            continue

        # 4) Token overlap (need >=2 matching tokens for confidence, or all-of-file tokens)
        overlap_en = len(en_toks & file_toks)
        overlap_tr = len(tr_toks & file_toks)
        overlap = max(overlap_en, overlap_tr)
        if overlap >= 2:
            score = overlap * 10 + 5
            if not best or score > best[0]:
                best = (score, f)
        elif overlap == 1 and len(file_toks) == 1 and file_toks.issubset(en_toks | tr_toks):
            score = 8
            if not best or score > best[0]:
                best = (score, f)

    return best[1] if best else None


def main():
    dry = "--dry-run" in sys.argv
    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        return

    files_raw = sb.storage.from_(BUCKET).list(PREFIX, {"limit": 500})
    files = [f["name"] for f in files_raw if not f["name"].startswith(".")]
    # Prefer .jpg over .jpeg duplicates, and "name.jpg" over "name (1).jpg"
    def file_priority(f: str) -> tuple[int, int, str]:
        stem = f.rsplit(".", 1)[0]
        ext = f.rsplit(".", 1)[-1].lower()
        has_paren = 1 if "(" in stem else 0
        ext_pri = {"jpg": 0, "jpeg": 1, "png": 2, "webp": 3}.get(ext, 9)
        return (has_paren, ext_pri, stem)
    files.sort(key=file_priority)

    print(f"🗄️  Bucket `{BUCKET}/{PREFIX}/`: {len(files)} files")

    pois = sb.table("pois").select("id,name,name_tr,category,image") \
        .eq("city_id", CITY_ID).limit(500).execute().data or []
    print(f"🏛️  DB has {len(pois)} Gaziantep POIs")

    used = set()
    updated = skipped = unmatched = 0
    unmatched_names: list[str] = []
    for p in pois:
        match = best_match(p["name"], p.get("name_tr") or "", files)
        if not match:
            unmatched_names.append(f"[{p['category']:10s}] {p['name']}")
            unmatched += 1
            continue
        new_url = public_url(match)
        if (p.get("image") or "") == new_url:
            skipped += 1
            used.add(match)
            continue
        if dry:
            print(f"  • [DRY] {p['name'][:35]:35s} -> {match}")
        else:
            sb.table("pois").update({"image": new_url}).eq("id", p["id"]).execute()
        updated += 1
        used.add(match)

    print(f"\n📊 Summary: {updated} updated, {skipped} already current, {unmatched} unmatched")
    if unmatched_names:
        print("\n⚠️  Unmatched POIs (will keep their current image):")
        for n in unmatched_names:
            print(f"    {n}")

    unused = [f for f in files if f not in used]
    if unused:
        print(f"\nℹ️  {len(unused)} unused file(s) in bucket:")
        for f in unused[:50]:
            print(f"    {f}")


if __name__ == "__main__":
    main()
