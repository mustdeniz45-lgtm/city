"""Seed the 11 new flexible Gaziantep quests (June 2026).

Quest types supported via embedded `trivia.requirements`:
  • min_check_ins      — proximity / welcome quest
  • specific_pois      — must visit ALL of these POI ids
  • category_groups    — list of {key, need, from_category|from_raw|from_ids, label}
  • dishes_min         — number of distinct dishes that must be tried
  • ky_visit_all       — visit every kultur_yolu POI in the city

The existing 5 Gaziantep quests are DELETED first. New quests use ids
q-gaz-101 through q-gaz-111.

Usage:
    cd /app/backend && python migrate_quests_v2.py
    cd /app/backend && python migrate_quests_v2.py --dry-run
"""
from __future__ import annotations

import json
import sys
from dotenv import load_dotenv

load_dotenv()
from supabase_client import get_supabase  # noqa: E402

CITY_ID = "gaziantep"

GAZIANTEP_CASTLE = "poi-gaz-009-gaziantep-castle"
EMINE_GOGUS = "poi-gaz-014-emine-g-culinary-museum"
TAHMIS_COFFEE = "poi-gaz-037-tahmis-coffee-house"

# Curated pools for non-tag categories
# Ancient sites = the 3 canonical archaeological sites of the Gaziantep region
ANCIENT_POOL = [
    "poi-gaz-083-yesemek-open-air-museum",      # KY #83 — Yesemek
    "poi-gaz-082-zeugma-belk-s-ancient-city",   # KY #82 — Zeugma
    "poi-gaz-061-karkam-ancient-city",          # KY #61 — Karkamış
]

NATURE_POOL = [
    "poi-gaz-064-k-kl-ce-canyon",
    "poi-gaz-063-habe-canyon",
    "poi-gaz-062-halfeti-sunken-village",
    "poi-gaz-066-ye-ilvadi-park",
    "poi-gaz-067-vadi-park",
    "poi-gaz-068-botanical-garden",
    "poi-gaz-078-engelliler-park",
    "poi-gaz-079-festival-park",
    "poi-gaz-081-uzay-park",
    "poi-gaz-065-bur-nature-park",
    "poi-gaz-071-f-st-k-park",
    "poi-gaz-072-kavakl-k-park",
]

# Brand images for quest covers
COVER = {
    "welcome":   "https://images.unsplash.com/photo-1554995207-c18c203602cb?w=900&q=70",
    "first":     "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=900&q=70",  # castle
    "museum":    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=900&q=70",
    "ancient":   "https://images.unsplash.com/photo-1542397284385-6010376c5337?w=900&q=70",
    "weekend":   "https://images.unsplash.com/photo-1564769625392-651b2c3a1d75?w=900&q=70",
    "silkroad":  "https://images.unsplash.com/photo-1591019479261-1a103585c559?w=900&q=70",
    "nature":    "https://images.unsplash.com/photo-1551041777-ed1f6e96f9f7?w=900&q=70",
    "ottoman":   "https://images.unsplash.com/photo-1568322445389-f64ac2515020?w=900&q=70",
    "culinary":  "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&q=70",
    "pilgrim":   "https://images.unsplash.com/photo-1518391846015-55a9cc003b25?w=900&q=70",
    "champion":  "https://images.unsplash.com/photo-1542213423-7c4c4eed1aef?w=900&q=70",
}

QUESTS = [
    {
        "id": "q-gaz-101", "title": "Welcome to Gaziantep",
        "description": "Set foot in the city of pistachio, mosaics and 8 000 years of history. Check in to any place within 50 km of Gaziantep Castle.",
        "difficulty": "easy", "category": "must-see",
        "xp_reward": 50, "estimated_minutes": 15,
        "badge_name": "Antep Newcomer", "cover_image": COVER["welcome"],
        "requirements": {"min_check_ins": 1},
        "trivia": None,
    },
    {
        "id": "q-gaz-102", "title": "First Steps",
        "description": "Climb Gaziantep Castle and explore 2 nearby landmarks.",
        "difficulty": "easy", "category": "landmark",
        "xp_reward": 120, "estimated_minutes": 90,
        "badge_name": "Castle Climber", "cover_image": COVER["first"],
        "requirements": {
            "specific_pois": [GAZIANTEP_CASTLE],
            "category_groups": [
                {"key": "landmark", "need": 2, "from_category": "landmark", "label": "Landmarks"},
            ],
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-103", "title": "Museum Hopper",
        "description": "Discover Gaziantep's storied past in 3 different museums.",
        "difficulty": "easy", "category": "museum",
        "xp_reward": 150, "estimated_minutes": 180,
        "badge_name": "Museum Hopper", "cover_image": COVER["museum"],
        "requirements": {
            "category_groups": [
                {"key": "museum", "need": 3, "from_category": "museum", "label": "Museums"},
            ],
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-104", "title": "Ancient Explorer",
        "description": "Travel back millennia at 2 of Gaziantep's ancient archaeological sites.",
        "difficulty": "medium", "category": "historic",
        "xp_reward": 200, "estimated_minutes": 240,
        "badge_name": "Ancient Explorer", "cover_image": COVER["ancient"],
        "requirements": {
            "category_groups": [
                {"key": "ancient", "need": 2, "from_ids": ANCIENT_POOL, "label": "Ancient Sites"},
            ],
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-105", "title": "Weekend Explorer",
        "description": "A full weekend itinerary: 5 landmarks, 3 museums, 1 ancient site and 5 local dishes.",
        "difficulty": "hard", "category": "must-see",
        "xp_reward": 400, "estimated_minutes": 720,
        "badge_name": "Weekender", "cover_image": COVER["weekend"],
        "requirements": {
            "category_groups": [
                {"key": "landmark", "need": 5, "from_category": "landmark", "label": "Landmarks"},
                {"key": "museum",   "need": 3, "from_category": "museum",   "label": "Museums"},
                {"key": "ancient",  "need": 1, "from_ids": ANCIENT_POOL,    "label": "Ancient Site"},
            ],
            "dishes_min": 5,
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-106", "title": "Historic Silk Road",
        "description": "Trace the old caravan route — Tahmis Coffeehouse (since 1635), 3 mosques, 2 hans, 1 hamam, and 6 local dishes.",
        "difficulty": "hard", "category": "historic",
        "xp_reward": 500, "estimated_minutes": 600,
        "badge_name": "Silk Road Trader", "cover_image": COVER["silkroad"],
        "requirements": {
            "specific_pois": [TAHMIS_COFFEE],
            "category_groups": [
                {"key": "mosque", "need": 3, "from_raw": "mosques", "label": "Mosques"},
                {"key": "han",    "need": 2, "from_raw": "hans",    "label": "Hans (Inns)"},
                {"key": "bath",   "need": 1, "from_raw": "bath",    "label": "Hamams"},
            ],
            "dishes_min": 6,
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-107", "title": "Nature & Antiquity",
        "description": "Wander through 1 canyon or park, 2 ancient sites, 2 landmarks and savour 6 local dishes.",
        "difficulty": "hard", "category": "must-see",
        "xp_reward": 450, "estimated_minutes": 600,
        "badge_name": "Naturalist", "cover_image": COVER["nature"],
        "requirements": {
            "category_groups": [
                {"key": "nature",   "need": 1, "from_ids": NATURE_POOL,  "label": "Canyon or Park"},
                {"key": "ancient",  "need": 2, "from_ids": ANCIENT_POOL, "label": "Ancient Sites"},
                {"key": "landmark", "need": 2, "from_category": "landmark", "label": "Landmarks"},
            ],
            "dishes_min": 6,
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-108", "title": "Ottoman Heritage Trail",
        "description": "Walk in the shoes of an Ottoman traveller: 7 mosques, 3 hans, 1 hamam and 9 local dishes.",
        "difficulty": "hard", "category": "historic",
        "xp_reward": 600, "estimated_minutes": 900,
        "badge_name": "Ottoman Voyager", "cover_image": COVER["ottoman"],
        "requirements": {
            "category_groups": [
                {"key": "mosque", "need": 7, "from_raw": "mosques", "label": "Mosques"},
                {"key": "han",    "need": 3, "from_raw": "hans",    "label": "Hans (Inns)"},
                {"key": "bath",   "need": 1, "from_raw": "bath",    "label": "Hamams"},
            ],
            "dishes_min": 9,
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-109", "title": "Culinary Deep Dive",
        "description": "Taste every Gaziantep dish (21+) and visit 5 museums — Emine Göğüş Culinary Museum is a must.",
        "difficulty": "hard", "category": "food",
        "xp_reward": 700, "estimated_minutes": 1440,
        "badge_name": "Iron Stomach", "cover_image": COVER["culinary"],
        "requirements": {
            "specific_pois": [EMINE_GOGUS],
            "category_groups": [
                {"key": "museum", "need": 5, "from_category": "museum", "label": "Museums"},
            ],
            "dishes_min": 21,
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-110", "title": "The Complete Pilgrim",
        "description": "An epic journey across the city: 8 landmarks, 8 museums, 3 ancient sites, 7 mosques and 15 local dishes.",
        "difficulty": "hard", "category": "must-see",
        "xp_reward": 900, "estimated_minutes": 2160,
        "badge_name": "Antep Pilgrim", "cover_image": COVER["pilgrim"],
        "requirements": {
            "category_groups": [
                {"key": "landmark", "need": 8, "from_category": "landmark", "label": "Landmarks"},
                {"key": "museum",   "need": 8, "from_category": "museum",   "label": "Museums"},
                {"key": "ancient",  "need": 3, "from_ids": ANCIENT_POOL,    "label": "Ancient Sites"},
                {"key": "mosque",   "need": 7, "from_raw": "mosques",       "label": "Mosques"},
            ],
            "dishes_min": 15,
        },
        "trivia": None,
    },
    {
        "id": "q-gaz-111", "title": "Kültür Yolu Champion",
        "description": "Walk every one of the 53 canonical Kültür Yolu stops in Gaziantep. The ultimate accomplishment.",
        "difficulty": "hard", "category": "historic",
        "xp_reward": 2000, "estimated_minutes": 4320,
        "badge_name": "Kültür Yolu Champion", "cover_image": COVER["champion"],
        # Requirement rebuilt at seed-time from live DB (ky_seq 1..53). See __main__.
        "requirements": {"ky53_canonical": True},
        "trivia": None,
    },
]


def build_trivia_blob(q: dict, ky53_ids: list[str] | None = None) -> dict | None:
    """Embed `requirements` inside the trivia JSONB column (since we can't
    add a column). Optional `trivia` question is preserved if provided.
    Expands the special `ky53_canonical: true` shortcut into a real
    `from_ids` category_group at seed-time.
    """
    req = dict(q.get("requirements") or {})
    if req.pop("ky53_canonical", False):
        assert ky53_ids and len(ky53_ids) == 53, "ky53_ids must be exactly 53 IDs"
        req["category_groups"] = [{
            "key": "ky53",
            "need": 53,
            "from_ids": ky53_ids,
            "label": "Kültür Yolu places",
        }]
    blob = dict(q.get("trivia") or {})
    blob["requirements"] = req
    return blob or None


def main():
    dry = "--dry-run" in sys.argv
    sb = get_supabase()
    if sb is None:
        print("❌ Supabase not configured")
        return

    # Load the canonical 53 KY POIs (ky_seq 1..53) — used by Q-111
    ky53_rows = (
        sb.table("pois")
        .select("id,ky_seq")
        .eq("city_id", CITY_ID)
        .eq("kultur_yolu", True)
        .lte("ky_seq", 53)
        .order("ky_seq")
        .execute()
        .data or []
    )
    ky53_ids = [r["id"] for r in ky53_rows]
    if len(ky53_ids) != 53:
        print(f"⚠️  Expected 53 canonical KY POIs, got {len(ky53_ids)}. Q-111 may not seed.")
        return

    existing = sb.table("quests").select("id,title").eq("city_id", CITY_ID).execute().data or []
    print(f"🔍 Found {len(existing)} existing Gaziantep quests")
    for q in existing:
        print(f"   - {q['id']} : {q['title']}")

    if not dry:
        # Delete old quests
        for q in existing:
            sb.table("quests").delete().eq("id", q["id"]).execute()
        print(f"🗑️  Deleted {len(existing)} old quests\n")
    else:
        print(f"🗑️  [DRY] would delete {len(existing)} old quests\n")

    print(f"🌱 Seeding {len(QUESTS)} new quests:")
    for q in QUESTS:
        row = {
            "id": q["id"], "city_id": CITY_ID,
            "title": q["title"], "description": q["description"],
            "difficulty": q["difficulty"], "category": q["category"],
            "xp_reward": q["xp_reward"], "poi_ids": [],
            "cover_image": q["cover_image"],
            "estimated_minutes": q["estimated_minutes"],
            "badge_name": q.get("badge_name"),
            "trivia": build_trivia_blob(q, ky53_ids=ky53_ids),
        }
        if dry:
            req = q.get("requirements") or {}
            summary = []
            if req.get("min_check_ins"): summary.append(f"min_check_ins={req['min_check_ins']}")
            if req.get("specific_pois"): summary.append(f"specific={len(req['specific_pois'])}")
            for g in req.get("category_groups") or []:
                summary.append(f"{g['key']}={g['need']}")
            if req.get("dishes_min"): summary.append(f"dishes={req['dishes_min']}")
            if req.get("ky_visit_all"): summary.append("ALL KY")
            print(f"   [DRY] {q['id']} {q['title']:32s} xp={q['xp_reward']:4d} | {', '.join(summary)}")
        else:
            sb.table("quests").upsert(row).execute()
            print(f"   ✅ {q['id']} {q['title']:32s} xp={q['xp_reward']}")

    # Update city's quest_count
    if not dry:
        sb.table("cities").update({"quest_count": len(QUESTS)}).eq("id", CITY_ID).execute()
        print(f"\n📊 city.quest_count updated to {len(QUESTS)}")


if __name__ == "__main__":
    main()
