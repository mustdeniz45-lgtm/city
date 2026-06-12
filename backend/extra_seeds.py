"""Seed the additional Gaziantep datasets uploaded by the user."""
from __future__ import annotations
import json
import math
import unicodedata
from pathlib import Path
from typing import Any

ASSETS = Path(__file__).parent / "seed_assets"

# Dishes share these placeholder images per dish kind (kept simple — user can
# replace later).
DISH_IMAGES = {
    "baklava":   "https://images.unsplash.com/photo-1598110750624-207050c4f28c?w=600&q=70",
    "kebab":     "https://images.unsplash.com/photo-1574484284002-952d92456975?w=600&q=70",
    "soup":      "https://images.unsplash.com/photo-1547592180-85f173990554?w=600&q=70",
    "default":   "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&q=70",
}

CAT_IMAGES = {
    "landmark":   "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=600&q=70",
    "museum":     "https://images.unsplash.com/photo-1564399579883-451a5d44ec08?w=600&q=70",
    "historic":   "https://images.unsplash.com/photo-1591019479261-1a103585c559?w=600&q=70",
    "must-see":   "https://images.unsplash.com/photo-1555992828-35627f3eea4d?w=600&q=70",
}

CAT_MAP = {
    "landmarks": "landmark",
    "museums": "museum",
    "ancient_site": "historic",
    "photo_spots": "must-see",
    "historic_sites": "historic",
}


def _normalize(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    return "".join(c for c in s.lower() if c.isalnum())


def _dish_image(name: str) -> str:
    n = name.lower()
    if "baklava" in n or "katmer" in n or "şöbiyet" in n or "sobiyet" in n or "künefe" in n or "kunefe" in n:
        return DISH_IMAGES["baklava"]
    if "kebab" in n or "kebabı" in n or "kebabi" in n or "ciğer" in n or "ciger" in n:
        return DISH_IMAGES["kebab"]
    if "çorba" in n or "corba" in n:
        return DISH_IMAGES["soup"]
    return DISH_IMAGES["default"]


def load_dishes() -> list[dict[str, Any]]:
    path = ASSETS / "gaziantep_yemekleri.json"
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for i, d in enumerate(raw, 1):
        name = d.get("isim", "").strip()
        if not name:
            continue
        out.append({
            "id": f"dish-gaz-{i:02d}",
            "city_id": "gaziantep",
            "name": name,
            "description": d.get("aciklama", "").strip(),
            "image": _dish_image(name),
            "tags": ["antep", "traditional"],
        })
    return out


def load_categorized_pois(existing_names: set[str], start_seq: int = 100) -> list[dict[str, Any]]:
    """Convert kultur_yolu_kategorize.json to POI docs, skipping duplicates."""
    path = ASSETS / "kultur_yolu_kategorize.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    # Spread coords along a deterministic golden-angle spiral around old city.
    center_lat, center_lng = 37.0660, 37.3833
    base_r = 0.012  # ~1.3 km max
    idx = 0
    for cat_key, items in data.items():
        cat = CAT_MAP.get(cat_key, "historic")
        for item in items:
            tr = (item.get("tr") or "").strip()
            en = (item.get("en") or tr).strip()
            if not (tr or en):
                continue
            if _normalize(tr) in existing_names or _normalize(en) in existing_names:
                continue
            idx += 1
            # Golden-angle spiral spread (visually pleasing, deterministic)
            angle_deg = (idx * 137.508) % 360
            r = base_r * (0.22 + (idx % 23) / 23 * 0.78)
            lat = center_lat + r * math.cos(math.radians(angle_deg))
            lng = center_lng + r * math.sin(math.radians(angle_deg))
            ky = bool(item.get("kulturyolu"))
            out.append({
                "id": f"poi-gaz-cat-{item.get('id') or idx}",
                "city_id": "gaziantep",
                "name": en,
                "name_tr": tr or None,
                "category": cat,
                "description": f"{tr or en} — {cat_key.replace('_', ' ').title()} in Gaziantep.",
                "image": CAT_IMAGES.get(cat, CAT_IMAGES["historic"]),
                "lat": lat,
                "lng": lng,
                "rating": 4.3,
                "xp_reward": 25,
                "kultur_yolu": ky,
                "ky_seq": (start_seq + idx) if ky else None,
                "source": "ky_cat",
            })
    return out
