"""Legacy Mongo-mode dish loader.

Loads the bundled gaziantep_yemekleri.json asset and prepares Dish docs
ready for Mongo insertion. Only used when DATA_BACKEND=mongo; the canonical
copies live in Supabase already.
"""
import json
import re
from pathlib import Path
from typing import Any

ASSETS = Path(__file__).parent / "seed_assets"

# Curated stock images for dishes whose name matches one of these tokens.
DISH_IMAGES: dict[str, str] = {
    "baklava":   "https://images.unsplash.com/photo-1598110750624-207050c4f28c?w=800&q=80",
    "kebap":     "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=80",
    "kebab":     "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=800&q=80",
    "lahmacun":  "https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=800&q=80",
    "pide":      "https://images.unsplash.com/photo-1606471191009-63994c53433b?w=800&q=80",
    "köfte":     "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    "kofte":     "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&q=80",
    "menemen":   "https://images.unsplash.com/photo-1604908554085-0d3a8ed00f47?w=800&q=80",
    "katmer":    "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=800&q=80",
    "kunefe":    "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=800&q=80",
    "künefe":    "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=800&q=80",
}
DEFAULT_DISH_IMAGE = "https://images.unsplash.com/photo-1574484284002-952d92456975?w=800&q=80"


def _normalize(s: str) -> str:
    """Loose-match key used for de-duping by name."""
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def _dish_image(name: str) -> str:
    n = _normalize(name)
    for token, url in DISH_IMAGES.items():
        if token in n:
            return url
    return DEFAULT_DISH_IMAGE


def load_dishes() -> list[dict[str, Any]]:
    """Read the gaziantep_yemekleri.json asset and return ready-to-insert dish docs."""
    path = ASSETS / "gaziantep_yemekleri.json"
    if not path.exists():
        return []
    raw = json.loads(path.read_text())
    out: list[dict[str, Any]] = []
    for i, row in enumerate(raw, start=1):
        name = (row.get("ad") or row.get("name") or "").strip()
        if not name:
            continue
        out.append({
            "id": f"dish-gaz-{i:03d}",
            "city_id": "gaziantep",
            "name": name,
            "description": (row.get("aciklama") or row.get("description") or "").strip(),
            "image": _dish_image(name),
            "tags": row.get("etiketler") or row.get("tags") or [],
        })
    return out
