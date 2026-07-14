"""One-off helper: seed sample gallery URLs for the Archaeology Museum
so we can verify the multi-image gallery UI end-to-end. Delete after use."""
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")
from supabase_client import get_supabase  # noqa: E402

POI_ID = "poi-gaz-mus-108-gaziantep-archaeology-museum"
SAMPLE_GALLERY = [
    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=1200&q=80",
    "https://images.unsplash.com/photo-1580537659466-0a9bfa916a54?w=1200&q=80",
    "https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=1200&q=80",
    "https://images.unsplash.com/photo-1594744803329-e58b31de8bf5?w=1200&q=80",
    "https://images.unsplash.com/photo-1544427920-c49ccfb85579?w=1200&q=80",
]

sb = get_supabase()
res = sb.table("pois").select("metadata").eq("id", POI_ID).limit(1).execute()
row = (res.data or [{}])[0]
md = (row.get("metadata") or {})
md["gallery"] = SAMPLE_GALLERY
sb.table("pois").update({"metadata": md}).eq("id", POI_ID).execute()

verify = sb.table("pois").select("metadata").eq("id", POI_ID).limit(1).execute()
count = len(((verify.data or [{}])[0].get("metadata") or {}).get("gallery") or [])
print(f"✅ Seeded {count} gallery images for {POI_ID}")
