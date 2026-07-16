"""One-off backfill: copy any legacy `metadata.gallery` URLs into the
first-class `pois.images` column. Runs on every POI whose `images` is
NULL/empty but has a non-empty `metadata.gallery` list. Idempotent."""
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from supabase_client import get_supabase  # noqa: E402

sb = get_supabase()
rows = sb.table("pois").select("id, images, metadata").execute().data or []
touched = 0
for r in rows:
    imgs = r.get("images") or []
    md_gallery = ((r.get("metadata") or {}).get("gallery")) or []
    if not imgs and md_gallery:
        clean = [u for u in md_gallery if isinstance(u, str) and u.strip()]
        if clean:
            sb.table("pois").update({"images": clean}).eq("id", r["id"]).execute()
            touched += 1
            print(f"  ↳ {r['id']}: {len(clean)} images backfilled")
print(f"\n✅ Backfilled {touched} POIs")
