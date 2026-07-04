"""
CityQuest backend — gamified worldwide city guide.
- No-auth, device-id based user progress.
- Seeds 4 cities (Gaziantep deep; Istanbul, Paris, Rome lighter) on startup.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import math
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Mongo is only created when actually needed (the `repo` layer requests it lazily).
# This avoids opening an idle Mongo connection when DATA_BACKEND=supabase.

import repo  # data-access layer (selects Mongo vs Supabase via DATA_BACKEND env)
from supabase_client import data_backend, get_supabase
from auth import get_current_user, get_optional_user, user_id_of
import anti_cheat

app = FastAPI(title="CityQuest API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------- Models ----------------

class City(BaseModel):
    id: str
    name: str
    country: str
    country_code: str
    tagline: str
    description: str
    hero_image: str
    lat: float
    lng: float
    poi_count: int = 0
    quest_count: int = 0

class POI(BaseModel):
    id: str
    city_id: str
    name: str
    category: str  # landmark | museum | historic | must-see | restaurant
    description: str
    image: str
    lat: float
    lng: float
    rating: Optional[float] = 4.5
    xp_reward: Optional[int] = 50
    kultur_yolu: Optional[bool] = False
    ky_seq: Optional[int] = None
    name_tr: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class TriviaQuestion(BaseModel):
    question: str
    options: List[str]
    correct_index: int

class Quest(BaseModel):
    id: str
    city_id: str
    title: str
    description: str
    difficulty: str  # easy | medium | hard
    category: str  # landmark | museum | historic | must-see | food
    xp_reward: int
    poi_ids: List[str] = []
    cover_image: str
    estimated_minutes: int = 60
    badge_name: Optional[str] = None
    trivia: Optional[TriviaQuestion] = None
    # Flexible requirements for v2 quests (mosques=N, museums=N, dishes=N, etc.).
    # Stored inside the `trivia` JSONB column as `trivia.requirements` (since we
    # cannot add a column at runtime). Lifted to the top level by `_lift_quest`.
    requirements: Optional[Dict[str, Any]] = None

class CheckInPayload(BaseModel):
    device_id: str
    quest_id: str
    poi_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    trivia_answer_index: Optional[int] = None
    display_name: Optional[str] = None
    avatar_uri: Optional[str] = None


class ProfileUpdatePayload(BaseModel):
    display_name: Optional[str] = None
    avatar_uri: Optional[str] = None  # set None or "" to clear

class CheckInResult(BaseModel):
    success: bool
    xp_earned: int
    total_xp: int
    level: int
    level_title: str
    leveled_up: bool
    quest_completed: bool
    badge_unlocked: Optional[str] = None
    city_stamped: bool = False
    stamped_city_name: Optional[str] = None
    visited_pois: List[str] = []
    total_pois: int = 0
    awaiting_trivia: bool = False
    too_far: bool = False
    distance_m: Optional[int] = None
    message: str


# Anti-cheat: check-ins must be within this radius of the POI.
CHECKIN_RADIUS_M = 150

def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance between two lat/lng coords in meters."""
    earth_r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * earth_r * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ---------------- Level system ----------------

LEVEL_TIERS = [
    (0,    1, "Newcomer"),
    (150,  2, "Curious Traveller"),
    (400,  3, "Bazaar Explorer"),
    (800,  4, "City Wanderer"),
    (1400, 5, "Antep Devotee"),
    (2200, 6, "Master Voyager"),
    (3200, 7, "Legend of CityQuest"),
]

def get_level(xp: int) -> Dict[str, Any]:
    current = LEVEL_TIERS[0]
    nxt = None
    for tier in LEVEL_TIERS:
        if xp >= tier[0]:
            current = tier
        else:
            nxt = tier
            break
    next_xp = nxt[0] if nxt else current[0]
    return {
        "level": current[1],
        "title": current[2],
        "xp": xp,
        "current_threshold": current[0],
        "next_threshold": next_xp,
        "progress": 1.0 if not nxt else round((xp - current[0]) / max(1, (next_xp - current[0])), 3),
    }

# ---------------- Seed Data ----------------

def _id() -> str:
    return str(uuid.uuid4())

def _load_gaziantep_places(city_id: str) -> List[Dict[str, Any]]:
    """Load Gaziantep places from the canonical JSON dataset.

    This is the SINGLE SOURCE OF TRUTH for Gaziantep POIs. The same file is
    used by `migrate_places_gaziantep.py` when populating Supabase.
    """
    import json as _json
    import re as _re
    path = ROOT_DIR / "seed_assets" / "places_gaziantep.json"
    if not path.exists():
        return []

    CATEGORY_PRIORITY = ["museums", "landmarks", "restaurant/cafe", "nature", "historic"]
    CATEGORY_MAP = {
        "museums": "museum", "landmarks": "landmark",
        "restaurant/cafe": "restaurant", "nature": "must-see", "historic": "historic",
    }
    FALLBACK = {
        "landmark":   "https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=600&q=70",
        "museum":     "https://images.unsplash.com/photo-1565060169186-65f5fad44e21?w=600&q=70",
        "historic":   "https://images.unsplash.com/photo-1545569310-50fee1e4b1c4?w=600&q=70",
        "restaurant": "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&q=70",
        "must-see":   "https://images.unsplash.com/photo-1574586597013-29bd92dc1617?w=600&q=70",
    }

    def slug(s: str) -> str:
        return _re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60] or "poi"

    def pick(cats: list) -> str:
        cats = [c.lower() for c in (cats or [])]
        for k in CATEGORY_PRIORITY:
            if k in cats:
                return CATEGORY_MAP[k]
        return "must-see"

    raw = _json.loads(path.read_text())
    items = raw.get("places", raw) if isinstance(raw, dict) else raw

    out: List[Dict[str, Any]] = []
    for item in items:
        # The v3 file uses `n`, the v4 file uses `id`.
        seq = int(item.get("id") or item.get("n") or 0)
        cat = pick(item.get("categories") or [])
        en = (item.get("en_name") or item.get("tr_name") or "Unnamed").strip()
        image = (item.get("image_url") or "").strip() or FALLBACK[cat]
        out.append({
            "id": f"poi-gaz-{seq:03d}-{slug(en)}",
            "city_id": city_id,
            "name": en,
            "name_tr": item.get("tr_name") or None,
            "category": cat,
            "description": (item.get("en_description") or item.get("tr_description") or "").strip(),
            "image": image,
            "lat": float(item["latitude"]),
            "lng": float(item["longitude"]),
            "rating": 4.5,
            "xp_reward": 40,
            "kultur_yolu": True,
            "ky_seq": seq,
            "source": "kultur_yolu_canonical",
            "metadata": {
                "tr_description": item.get("tr_description"),
                "raw_categories": item.get("categories"),
                "address": (item.get("address") or "").strip() or None,
                "plus_code": (item.get("plus_code") or "").strip() or None,
            },
        })
    return out


def build_seed() -> Dict[str, Any]:
    # Gaziantep POIs
    gaz = "gaziantep"
    ist = "istanbul"
    par = "paris"
    rom = "rome"

    cities = [
        {
            "id": gaz, "name": "Gaziantep", "country": "Türkiye", "country_code": "TR",
            "tagline": "Cradle of gastronomy & ancient mosaics",
            "description": "A southeastern Anatolian city where Roman mosaics, Ottoman bazaars, and the world's finest baklava converge.",
            "hero_image": "https://images.unsplash.com/photo-1712263806377-beac33b9ae3a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwxfHxHYXppYW50ZXAlMjBaZXVnbWElMjBtdXNldW0lMjBtb3NhaWN8ZW58MHx8fHwxNzgxMTExOTE0fDA&ixlib=rb-4.1.0&q=85",
            "lat": 37.0660, "lng": 37.3833,
        },
        {
            "id": ist, "name": "Istanbul", "country": "Türkiye", "country_code": "TR",
            "tagline": "Where two continents meet",
            "description": "Byzantine domes, Ottoman palaces, and the Bosphorus at sunset.",
            "hero_image": "https://images.unsplash.com/photo-1582631608254-f75fdf938e19?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzV8MHwxfHNlYXJjaHwxfHxJc3RhbmJ1bCUyMEhhZ2lhJTIwU29waGlhJTIwb3IlMjBHYWxhdGElMjB0b3dlcnxlbnwwfHx8fDE3ODExMTE5MTR8MA&ixlib=rb-4.1.0&q=85",
            "lat": 41.0082, "lng": 28.9784,
        },
        {
            "id": par, "name": "Paris", "country": "France", "country_code": "FR",
            "tagline": "The city of light",
            "description": "Belle Époque boulevards, world-class museums, and cafés that perfected the art of slowing down.",
            "hero_image": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzB8MHwxfHNlYXJjaHwxfHxQYXJpcyUyMEVpZmZlbCUyMHRvd2VyJTIwc3Vuc2V0fGVufDB8fHx8MTc4MTExMTkxNHww&ixlib=rb-4.1.0&q=85",
            "lat": 48.8566, "lng": 2.3522,
        },
        {
            "id": rom, "name": "Rome", "country": "Italy", "country_code": "IT",
            "tagline": "The eternal city",
            "description": "Ancient ruins, baroque squares, and pasta that has been perfected over two millennia.",
            "hero_image": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2ODl8MHwxfHNlYXJjaHwxfHxSb21lJTIwQ29sb3NzZXVtJTIwYXJjaGl0ZWN0dXJlfGVufDB8fHx8MTc4MTExMTkxNHww&ixlib=rb-4.1.0&q=85",
            "lat": 41.9028, "lng": 12.4964,
        },
    ]

    pois = []
    # Gaziantep — loaded from the canonical JSON dataset (single source of truth).
    pois += _load_gaziantep_places(gaz)
    # Istanbul
    pois += [
        {"id":"poi-ist-1","city_id":ist,"name":"Hagia Sophia","category":"landmark",
         "description":"A 1,500-year-old marvel that has been church, mosque, museum, and mosque again.","image":"https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80","lat":41.0086,"lng":28.9802,"rating":4.9,"xp_reward":90},
        {"id":"poi-ist-2","city_id":ist,"name":"Topkapı Palace","category":"museum",
         "description":"The opulent primary residence of the Ottoman sultans for 400 years.","image":"https://images.unsplash.com/photo-1604941908760-bf9d3a3f6df5?w=800&q=80","lat":41.0115,"lng":28.9833,"rating":4.7,"xp_reward":80},
        {"id":"poi-ist-3","city_id":ist,"name":"Grand Bazaar","category":"must-see",
         "description":"One of the world's oldest and largest covered markets, with 4,000 shops across 61 streets.","image":"https://images.unsplash.com/photo-1545569310-49edaae3fd9d?w=800&q=80","lat":41.0106,"lng":28.9681,"rating":4.6,"xp_reward":55},
        {"id":"poi-ist-4","city_id":ist,"name":"Karaköy Lokantası","category":"restaurant",
         "description":"Beloved meyhane serving modern Istanbul mezze in turquoise-tiled rooms.","image":"https://images.unsplash.com/photo-1574484284002-952d92456975?w=800&q=80","lat":41.0258,"lng":28.9744,"rating":4.7,"xp_reward":50},
    ]
    # Paris
    pois += [
        {"id":"poi-par-1","city_id":par,"name":"Eiffel Tower","category":"landmark",
         "description":"The 330m wrought-iron icon that defined Paris's skyline in 1889.","image":"https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80","lat":48.8584,"lng":2.2945,"rating":4.8,"xp_reward":85},
        {"id":"poi-par-2","city_id":par,"name":"Louvre Museum","category":"museum",
         "description":"The world's most-visited museum, home to the Mona Lisa and Venus de Milo.","image":"https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80","lat":48.8606,"lng":2.3376,"rating":4.8,"xp_reward":90},
        {"id":"poi-par-3","city_id":par,"name":"Notre-Dame Cathedral","category":"historic",
         "description":"Gothic masterpiece on Île de la Cité, recently reopened after restoration.","image":"https://images.unsplash.com/photo-1478391679764-b2d8b3cd1e94?w=800&q=80","lat":48.8530,"lng":2.3499,"rating":4.7,"xp_reward":70},
        {"id":"poi-par-4","city_id":par,"name":"Le Comptoir du Relais","category":"restaurant",
         "description":"Yves Camdeborde's tiny Saint-Germain bistro reinvented French comfort cooking.","image":"https://images.unsplash.com/photo-1551218808-94e220e084d2?w=800&q=80","lat":48.8531,"lng":2.3387,"rating":4.6,"xp_reward":55},
    ]
    # Rome
    pois += [
        {"id":"poi-rom-1","city_id":rom,"name":"Colosseum","category":"landmark",
         "description":"The largest ancient amphitheatre ever built, AD 80, seating 50,000 spectators.","image":"https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80","lat":41.8902,"lng":12.4922,"rating":4.9,"xp_reward":90},
        {"id":"poi-rom-2","city_id":rom,"name":"Roman Forum","category":"historic",
         "description":"The political and commercial heart of ancient Rome for over a thousand years.","image":"https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=800&q=80","lat":41.8925,"lng":12.4853,"rating":4.7,"xp_reward":75},
        {"id":"poi-rom-3","city_id":rom,"name":"Vatican Museums","category":"museum",
         "description":"7km of galleries culminating in Michelangelo's Sistine Chapel ceiling.","image":"https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=800&q=80","lat":41.9065,"lng":12.4536,"rating":4.8,"xp_reward":85},
        {"id":"poi-rom-4","city_id":rom,"name":"Roscioli","category":"restaurant",
         "description":"Salumeria, bakery, and trattoria serving the city's definitive cacio e pepe.","image":"https://images.unsplash.com/photo-1662197480393-2a82030b7b83?w=800&q=80","lat":41.8956,"lng":12.4747,"rating":4.7,"xp_reward":55},
    ]

    # Quests
    quests = [
        # Gaziantep
        {"id":"q-gaz-1","city_id":gaz,"title":"Mosaic Hunter","description":"Visit the Zeugma Mosaic Museum and find the Gypsy Girl.",
         "difficulty":"easy","category":"museum","xp_reward":75,"poi_ids":["poi-gaz-054-zeugma-mosaic-museum"],
         "cover_image":"https://images.unsplash.com/photo-1712263806377-beac33b9ae3a?w=800&q=80","estimated_minutes":60,"badge_name":"Mosaic Eye",
         "trivia":{"question":"Which iconic mosaic is displayed at the Zeugma Museum?","options":["Gypsy Girl","Alexander Mosaic","Bird & Snake","Hercules"],"correct_index":0}},
        {"id":"q-gaz-2","city_id":gaz,"title":"Culinary Heritage","description":"Discover Gaziantep's UNESCO-recognized cuisine at Emine Göğüş Mutfak Müzesi.",
         "difficulty":"easy","category":"museum","xp_reward":60,"poi_ids":["poi-gaz-014-emine-g-culinary-museum"],
         "cover_image":"https://images.unsplash.com/photo-1598110750624-207050c4f28c?w=800&q=80","estimated_minutes":30,"badge_name":"Cuisine Curator",
         "trivia":{"question":"Which nut traditionally fills Antep baklava?","options":["Walnut","Almond","Antep Pistachio","Hazelnut"],"correct_index":2}},
        {"id":"q-gaz-3","city_id":gaz,"title":"Coppersmith Wanderer","description":"Explore the Bakırcılar Bazaar and observe artisans at work.",
         "difficulty":"medium","category":"must-see","xp_reward":100,"poi_ids":["poi-gaz-029-coppersmiths-bazaar","poi-gaz-037-tahmis-coffee-house"],
         "cover_image":"https://images.unsplash.com/photo-1574586597013-29bd92dc1617?w=800&q=80","estimated_minutes":90,"badge_name":"Bazaar Explorer",
         "trivia":{"question":"What metal is the bazaar famous for?","options":["Silver","Copper","Bronze","Gold"],"correct_index":1}},
        {"id":"q-gaz-4","city_id":gaz,"title":"Castle of Antep","description":"Climb the Gaziantep Castle and discover its Roman roots.",
         "difficulty":"medium","category":"historic","xp_reward":90,"poi_ids":["poi-gaz-009-gaziantep-castle"],
         "cover_image":"https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80","estimated_minutes":75,"badge_name":"Castle Climber",
         "trivia":{"question":"Which empire originally built Gaziantep Castle?","options":["Ottoman","Hittite","Roman","Byzantine"],"correct_index":2}},
        {"id":"q-gaz-5","city_id":gaz,"title":"Antep Heritage Trail","description":"Complete a full circuit of the old city's castle, culinary museum, and coffee houses.",
         "difficulty":"hard","category":"historic","xp_reward":150,"poi_ids":["poi-gaz-009-gaziantep-castle","poi-gaz-014-emine-g-culinary-museum","poi-gaz-037-tahmis-coffee-house"],
         "cover_image":"https://images.unsplash.com/photo-1591019479261-1a103585c559?w=800&q=80","estimated_minutes":180,"badge_name":"Heritage Guardian",
         "trivia":{"question":"Which UNESCO designation does Gaziantep hold?","options":["Music","Gastronomy","Architecture","Crafts"],"correct_index":1}},
        # Istanbul
        {"id":"q-ist-1","city_id":ist,"title":"Domes of the Old City","description":"Stand inside Hagia Sophia and admire the 6th-century dome.",
         "difficulty":"easy","category":"landmark","xp_reward":75,"poi_ids":["poi-ist-1"],
         "cover_image":"https://images.unsplash.com/photo-1541432901042-2d8bd64b4a9b?w=800&q=80","estimated_minutes":60,"badge_name":"Dome Gazer",
         "trivia":{"question":"In what year was Hagia Sophia completed?","options":["537 AD","850 AD","1204 AD","1453 AD"],"correct_index":0}},
        {"id":"q-ist-2","city_id":ist,"title":"Sultan's Palace","description":"Walk the corridors of Topkapı and view the Imperial Treasury.",
         "difficulty":"medium","category":"museum","xp_reward":100,"poi_ids":["poi-ist-2"],
         "cover_image":"https://images.unsplash.com/photo-1604941908760-bf9d3a3f6df5?w=800&q=80","estimated_minutes":120,"badge_name":"Imperial Visitor",
         "trivia":{"question":"How many sultans ruled from Topkapı Palace?","options":["12","18","25","31"],"correct_index":2}},
        {"id":"q-ist-3","city_id":ist,"title":"Bazaar Bargainer","description":"Navigate the Grand Bazaar and try a Turkish coffee.",
         "difficulty":"hard","category":"must-see","xp_reward":140,"poi_ids":["poi-ist-3","poi-ist-4"],
         "cover_image":"https://images.unsplash.com/photo-1545569310-49edaae3fd9d?w=800&q=80","estimated_minutes":150,"badge_name":"Master Bargainer",
         "trivia":{"question":"How many shops does the Grand Bazaar host?","options":["~1,200","~2,500","~4,000","~6,000"],"correct_index":2}},
        # Paris
        {"id":"q-par-1","city_id":par,"title":"Iron Lady","description":"Stand at the foot of the Eiffel Tower at golden hour.",
         "difficulty":"easy","category":"landmark","xp_reward":75,"poi_ids":["poi-par-1"],
         "cover_image":"https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&q=80","estimated_minutes":45,"badge_name":"Iron Lady",
         "trivia":{"question":"In what year was the Eiffel Tower completed?","options":["1855","1889","1901","1925"],"correct_index":1}},
        {"id":"q-par-2","city_id":par,"title":"Louvre Marathon","description":"Find the Mona Lisa, Venus de Milo, and Winged Victory.",
         "difficulty":"hard","category":"museum","xp_reward":150,"poi_ids":["poi-par-2"],
         "cover_image":"https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&q=80","estimated_minutes":240,"badge_name":"Louvre Scholar",
         "trivia":{"question":"Who painted the Mona Lisa?","options":["Raphael","Michelangelo","Da Vinci","Botticelli"],"correct_index":2}},
        {"id":"q-par-3","city_id":par,"title":"Bistro Hunter","description":"Dine at Le Comptoir du Relais.",
         "difficulty":"medium","category":"food","xp_reward":95,"poi_ids":["poi-par-4"],
         "cover_image":"https://images.unsplash.com/photo-1551218808-94e220e084d2?w=800&q=80","estimated_minutes":90,"badge_name":"Bistro Hunter",
         "trivia":{"question":"In which arrondissement is Saint-Germain-des-Prés?","options":["3rd","6th","10th","18th"],"correct_index":1}},
        # Rome
        {"id":"q-rom-1","city_id":rom,"title":"Gladiator's Arena","description":"Step inside the Colosseum and walk the arena floor.",
         "difficulty":"easy","category":"landmark","xp_reward":80,"poi_ids":["poi-rom-1"],
         "cover_image":"https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&q=80","estimated_minutes":60,"badge_name":"Gladiator",
         "trivia":{"question":"How many spectators did the Colosseum hold?","options":["10,000","25,000","50,000","100,000"],"correct_index":2}},
        {"id":"q-rom-2","city_id":rom,"title":"Forum to Palatine","description":"Cross the Roman Forum and ascend Palatine Hill.",
         "difficulty":"medium","category":"historic","xp_reward":105,"poi_ids":["poi-rom-2"],
         "cover_image":"https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=800&q=80","estimated_minutes":120,"badge_name":"Forum Walker",
         "trivia":{"question":"Which hill is considered Rome's birthplace?","options":["Aventine","Capitoline","Palatine","Esquiline"],"correct_index":2}},
        {"id":"q-rom-3","city_id":rom,"title":"Sistine Pilgrim","description":"View Michelangelo's frescoes at the Vatican.",
         "difficulty":"hard","category":"museum","xp_reward":145,"poi_ids":["poi-rom-3"],
         "cover_image":"https://images.unsplash.com/photo-1531572753322-ad063cecc140?w=800&q=80","estimated_minutes":180,"badge_name":"Sistine Pilgrim",
         "trivia":{"question":"How long did Michelangelo take to paint the Sistine ceiling?","options":["1 year","4 years","9 years","15 years"],"correct_index":1}},
    ]

    return {"cities": cities, "pois": pois, "quests": quests}

async def seed_if_empty():
    """Legacy Mongo seed. Not used when DATA_BACKEND=supabase (which is now the default).

    Seeds:
      * 4 cities (Gaziantep + Istanbul/Paris/Rome stubs)
      * Istanbul/Paris/Rome inline POIs + quests
      * Gaziantep POIs from `seed_assets/places_gaziantep.json` (canonical 97 places)
      * Gaziantep dishes from `seed_assets/gaziantep_yemekleri.json`
      * Gaziantep quests (id-remapped to the canonical place ids)
    """
    db = repo._mongo()
    count = await db.cities.count_documents({})
    if count == 0:
        seed = build_seed()
        if seed["cities"]:
            await db.cities.insert_many([dict(c) for c in seed["cities"]])
        if seed["pois"]:
            await db.pois.insert_many([dict(p) for p in seed["pois"]])
        if seed["quests"]:
            await db.quests.insert_many([dict(q) for q in seed["quests"]])
        logger.info("Base seed (cities + Istanbul/Paris/Rome content) complete.")
    else:
        logger.info(f"DB already seeded: {count} cities")

    # Refresh poi/quest counts on every startup
    for c in await db.cities.find({}, {"_id": 0}).to_list(50):
        poi_count = await db.pois.count_documents({"city_id": c["id"]})
        quest_count = await db.quests.count_documents({"city_id": c["id"]})
        await db.cities.update_one(
            {"id": c["id"]},
            {"$set": {"poi_count": poi_count, "quest_count": quest_count}},
        )


async def seed_extra_assets():
    """Seed dishes (Mongo-only). Gaziantep places are loaded from the canonical
    `places_gaziantep.json` already during `seed_if_empty()` via `build_seed()`."""
    from extra_seeds import load_dishes
    db = repo._mongo()
    if await db.dishes.count_documents({"city_id": "gaziantep"}) == 0:
        dishes = load_dishes()
        if dishes:
            await db.dishes.insert_many(dishes)
            logger.info(f"Inserted {len(dishes)} Gaziantep dishes.")

# ---------------- Routes ----------------

@api_router.get("/")
async def root():
    return {"app": "CityQuest", "status": "ok"}

@api_router.get("/cities", response_model=List[City])
async def list_cities():
    docs = await repo.cities_list()
    return [City(**d) for d in docs]

@api_router.get("/cities/{city_id}", response_model=City)
async def get_city(city_id: str):
    doc = await repo.cities_get(city_id)
    if not doc:
        raise HTTPException(404, "City not found")
    return City(**doc)

@api_router.get("/cities/{city_id}/pois", response_model=List[POI])
async def list_pois(
    city_id: str,
    category: Optional[str] = Query(None),
    kultur_yolu: Optional[bool] = Query(None),
):
    docs = await repo.pois_list(city_id, category=category, kultur_yolu=kultur_yolu)
    return [POI(**d) for d in docs]


@api_router.get("/cities/{city_id}/kultur-yolu", response_model=List[POI])
async def list_kultur_yolu(city_id: str):
    docs = await repo.pois_kultur_yolu(city_id)
    return [POI(**d) for d in docs]

@api_router.get("/cities/{city_id}/food", response_model=List[POI])
async def list_food(city_id: str):
    docs = await repo.pois_food(city_id)
    return [POI(**d) for d in docs]

@api_router.get("/pois/{poi_id}", response_model=POI)
async def get_poi(poi_id: str):
    doc = await repo.pois_get(poi_id)
    if not doc:
        raise HTTPException(404, "POI not found")
    return POI(**doc)


class PoiCheckInPayload(BaseModel):
    device_id: str
    poi_id: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    display_name: Optional[str] = None


class PoiCheckInResult(BaseModel):
    success: bool
    too_far: bool = False
    distance_m: Optional[int] = None
    quests_credited: List[str] = []
    already_visited: bool = False
    message: str
    xp_earned: int = 0
    total_xp: Optional[int] = None
    leveled_up: bool = False


class DishTriedPayload(BaseModel):
    device_id: str
    dish_id: str
    dish_name: Optional[str] = None
    display_name: Optional[str] = None


class DishTriedResult(BaseModel):
    success: bool
    already_tried: bool = False
    xp_earned: int = 0
    total_xp: int = 0
    tried_dishes: List[str] = []
    leveled_up: bool = False
    message: str


DISH_XP = 25


@api_router.post("/progress/poi-check-in", response_model=PoiCheckInResult)
async def poi_check_in(payload: PoiCheckInPayload, request: Request):
    poi = await repo.pois_get(payload.poi_id)
    if not poi:
        raise HTTPException(404, "POI not found")

    if payload.lat is not None and payload.lng is not None:
        d = haversine_m(payload.lat, payload.lng, poi["lat"], poi["lng"])
        if d > CHECKIN_RADIUS_M:
            pretty = f"{int(round(d))} m" if d < 10000 else f"{d/1000:.1f} km"
            return PoiCheckInResult(
                success=False, too_far=True, distance_m=int(round(d)),
                message=f"You're {pretty} from {poi['name']}. Walk within {CHECKIN_RADIUS_M} m to check in.",
            )

    user = await repo.progress_get(payload.device_id) or {
        "device_id": payload.device_id,
        "display_name": payload.display_name or "Traveler",
        "xp": 0, "completed_quests": [], "badges": [], "check_ins": [],
        "quest_progress": {},
    }
    user.setdefault("xp", 0)
    user.setdefault("completed_quests", [])
    user.setdefault("badges", [])
    user.setdefault("check_ins", [])

    # Anti-cheat: rate limit, per-POI cooldown, and superhuman-speed detection.
    # We run this AFTER loading the user's history but BEFORE mutating state so
    # attackers can't accumulate partial progress from rejected attempts.
    gate = anti_cheat.check_pre_gate(
        device_id=payload.device_id,
        request=request,
        last_check_ins=user.get("check_ins") or [],
        poi_id=payload.poi_id,
        lat=payload.lat, lng=payload.lng,
    )
    if not gate.ok:
        raise HTTPException(status_code=429, detail=gate.reason)
    if user.get("quest_progress") is None:
        user["quest_progress"] = {}
    # Normalize legacy entries that stored visited POIs as a bare list
    # (older clients) into the {visited: [...]} shape used today.
    qp_dict = user["quest_progress"] if isinstance(user.get("quest_progress"), dict) else {}
    user["quest_progress"] = qp_dict
    for _qid, _val in list(qp_dict.items()):
        if isinstance(_val, list):
            qp_dict[_qid] = {"visited": _val}
        elif not isinstance(_val, dict):
            qp_dict[_qid] = {"visited": []}

    # Has the user already visited this POI in any quest context?
    already = any(payload.poi_id in (qp.get("visited") or []) for qp in user["quest_progress"].values())
    # Also check the standalone visits log (a POI can be visited outside of any quest)
    visited_pois_ever = {ci.get("poi_id") for ci in (user.get("check_ins") or []) if ci.get("poi_id")}
    is_first_visit = payload.poi_id not in visited_pois_ever and not already

    quests = await repo.quests_for_poi(poi["city_id"], payload.poi_id)
    credited: List[str] = []
    for q in quests:
        qid = q["id"]
        if qid in user["completed_quests"]:
            continue
        qp = user["quest_progress"].setdefault(qid, {"visited": []})
        if payload.poi_id not in (qp.get("visited") or []):
            qp.setdefault("visited", []).append(payload.poi_id)
            credited.append(qid)

    # Award the POI's xp_reward on FIRST visit (idempotent thanks to is_first_visit).
    poi_xp = int(poi.get("xp_reward") or 0) if is_first_visit else 0
    prev_level = get_level(user.get("xp", 0))["level"]
    user["xp"] = user.get("xp", 0) + poi_xp

    user["check_ins"].append({
        "quest_id": None,
        "poi_id": payload.poi_id,
        "lat": payload.lat, "lng": payload.lng,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    # Anti-cheat: cap the persisted list so it can't grow unbounded and DoS
    # the DB row / clients that fetch the whole progress object.
    user["check_ins"] = anti_cheat.bound_check_ins(user["check_ins"])
    if payload.display_name:
        user["display_name"] = payload.display_name
    user["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Re-evaluate ALL city quests now that this POI was visited.
    new_quest_ids, quest_xp = await _recompute_quest_completion(user, poi["city_id"])
    credited.extend(new_quest_ids)

    await repo.progress_upsert(payload.device_id, user)

    new_level = get_level(user["xp"])["level"]
    leveled_up = new_level > prev_level

    n = len(credited)
    parts: List[str] = []
    if poi_xp > 0:
        parts.append(f"+{poi_xp} XP")
    if n == 0 and already:
        parts.append(f"You've already checked in at {poi['name']}.")
    elif n == 0:
        parts.append(f"Visit recorded at {poi['name']}!")
    elif n == 1:
        parts.append(f"Visited {poi['name']}! Counted toward 1 quest.")
    else:
        parts.append(f"Visited {poi['name']}! Counted toward {n} quests.")
    msg = " — ".join(parts) if parts else "Visit recorded."
    if leveled_up:
        msg += f" 🎉 Leveled up to {get_level(user['xp'])['title']}!"

    return PoiCheckInResult(
        success=True, too_far=False,
        quests_credited=credited, already_visited=already and n == 0,
        message=msg,
        xp_earned=poi_xp,
        total_xp=user["xp"],
        leveled_up=leveled_up,
    )


def _lift_quest(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Extract `trivia.requirements` to top-level `requirements` and strip the
    nested copy so the returned `trivia` is a clean TriviaQuestion (or None).
    """
    out = dict(doc)
    triv = out.get("trivia") or None
    if isinstance(triv, dict):
        triv = dict(triv)
        reqs = triv.pop("requirements", None)
        if reqs:
            out["requirements"] = reqs
        # If only the embedded requirements remained (no real question), null trivia
        if not triv.get("question"):
            triv = None
        out["trivia"] = triv
    return out


def _poi_summary(p: Dict[str, Any], visited_ids: set) -> Dict[str, Any]:
    return {
        "id": p["id"],
        "kind": "poi",
        "name": p.get("name") or "",
        "image": p.get("image") or "",
        "category": p.get("category") or "",
        "visited": p["id"] in visited_ids,
    }


def _dish_summary(d: Dict[str, Any], tried_ids: set) -> Dict[str, Any]:
    return {
        "id": d["id"],
        "kind": "dish",
        "name": d.get("name") or "",
        "image": d.get("image") or "",
        "visited": d["id"] in tried_ids,
    }


def evaluate_quest_progress(
    quest_row: Dict[str, Any],
    user: Dict[str, Any],
    city_pois: List[Dict[str, Any]],
    city_dishes: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Return {satisfied, progress[]} for the given quest + user.
    Each progress entry: {key, label, type, current, need, candidates[], [poi_id]}.
    `candidates` is the pool of POIs/dishes that satisfy this requirement,
    used by the UI to render suggested places + a shuffle button.
    """
    lifted = _lift_quest(quest_row)
    req = lifted.get("requirements") or {}
    visited_ids = {
        ci.get("poi_id") for ci in (user.get("check_ins") or []) if ci.get("poi_id")
    }
    qp = user.get("quest_progress") or {}
    tried_dishes = set(qp.get("__dishes_tried") or [])

    poi_map = {p["id"]: p for p in city_pois}
    city_dishes = city_dishes or []

    progress: List[Dict[str, Any]] = []
    ok = True

    # 1. Specific POIs — all required
    for pid in (req.get("specific_pois") or []):
        p = poi_map.get(pid) or {"id": pid, "name": pid}
        done = pid in visited_ids
        progress.append({
            "key": f"specific_{pid}",
            "label": p.get("name", pid),
            "type": "specific",
            "current": 1 if done else 0,
            "need": 1,
            "poi_id": pid,
            "candidates": [_poi_summary(p, visited_ids)] if p.get("category") is not None else [],
        })
        if not done:
            ok = False

    # 2. Category groups
    for g in req.get("category_groups") or []:
        # Build candidate pool from the group's filter
        if "from_ids" in g:
            pool = [poi_map[i] for i in (g.get("from_ids") or []) if i in poi_map]
        elif "from_category" in g:
            pool = [p for p in city_pois if p.get("category") == g["from_category"]]
        elif "from_raw" in g:
            pool = [
                p for p in city_pois
                if g["from_raw"] in (((p.get("metadata") or {}).get("raw_categories")) or [])
            ]
        else:
            pool = []

        n = sum(1 for p in pool if p["id"] in visited_ids)
        need = int(g.get("need", 0))
        progress.append({
            "key": g.get("key") or "group",
            "label": g.get("label") or g.get("key") or "Visits",
            "type": "category",
            "current": min(n, need),
            "need": need,
            "candidates": [_poi_summary(p, visited_ids) for p in pool],
        })
        if n < need:
            ok = False

    # 3. Dishes
    dishes_min = int(req.get("dishes_min") or 0)
    if dishes_min:
        n = len(tried_dishes)
        progress.append({
            "key": "dishes",
            "label": "Local dishes tried",
            "type": "dishes",
            "current": min(n, dishes_min),
            "need": dishes_min,
            "candidates": [_dish_summary(d, tried_dishes) for d in city_dishes],
        })
        if n < dishes_min:
            ok = False

    # 4. Minimum check-ins (welcome quest)
    min_ci = int(req.get("min_check_ins") or 0)
    if min_ci:
        n = len(visited_ids)
        progress.append({
            "key": "check_ins",
            "label": "Places checked-in",
            "type": "check_ins",
            "current": min(n, min_ci),
            "need": min_ci,
            "candidates": [_poi_summary(p, visited_ids) for p in city_pois[:50]],
        })
        if n < min_ci:
            ok = False

    # 5. ky_visit_all
    if req.get("ky_visit_all"):
        ky_pois = [p for p in city_pois if p.get("kultur_yolu")]
        ky_total = len(ky_pois)
        visited_ky = sum(1 for p in ky_pois if p["id"] in visited_ids)
        progress.append({
            "key": "ky_all",
            "label": "Kültür Yolu places",
            "type": "ky_all",
            "current": visited_ky,
            "need": ky_total,
            "candidates": [_poi_summary(p, visited_ids) for p in ky_pois],
        })
        if visited_ky < ky_total:
            ok = False

    # Legacy: no v2 requirements, fall back to old poi_ids semantics
    if not progress and quest_row.get("poi_ids"):
        ids = list(quest_row.get("poi_ids") or [])
        legacy_pool = [poi_map[i] for i in ids if i in poi_map]
        n = sum(1 for i in ids if i in visited_ids)
        progress.append({
            "key": "legacy", "label": "Visits", "type": "legacy",
            "current": n, "need": len(ids),
            "candidates": [_poi_summary(p, visited_ids) for p in legacy_pool],
        })
        if n < len(ids):
            ok = False

    return {"satisfied": ok and bool(progress), "progress": progress}


async def _recompute_quest_completion(
    user: Dict[str, Any], city_id: str
) -> tuple[List[str], int]:
    """Re-evaluate every quest in the city for the user; auto-complete any whose
    requirements are now satisfied and credit XP. Returns (newly_completed, xp_added).
    """
    quests = await repo.quests_list(city_id)
    pois = await repo.pois_list(city_id)
    user.setdefault("completed_quests", [])
    user.setdefault("quest_progress", {})

    new_ids: List[str] = []
    xp_added = 0
    for q in quests:
        if q["id"] in user["completed_quests"]:
            continue
        result = evaluate_quest_progress(q, user, pois)
        if result["satisfied"]:
            new_ids.append(q["id"])
            user["completed_quests"].append(q["id"])
            xp_added += int(q.get("xp_reward") or 0)
    if xp_added:
        user["xp"] = int(user.get("xp") or 0) + xp_added
    return new_ids, xp_added



@api_router.get("/cities/{city_id}/quests", response_model=List[Quest])
async def list_quests(city_id: str, difficulty: Optional[str] = Query(None)):
    docs = await repo.quests_list(city_id, difficulty=difficulty)
    return [Quest(**_lift_quest(d)) for d in docs]

@api_router.get("/quests/{quest_id}", response_model=Quest)
async def get_quest(quest_id: str):
    doc = await repo.quests_get(quest_id)
    if not doc:
        raise HTTPException(404, "Quest not found")
    return Quest(**_lift_quest(doc))


@api_router.get("/quests/{quest_id}/progress")
async def get_quest_progress(quest_id: str, device_id: str = Query(...)):
    """Return live, fine-grained progress for a quest+device pair."""
    quest = await repo.quests_get(quest_id)
    if not quest:
        raise HTTPException(404, "Quest not found")
    user = await repo.progress_get(device_id) or {
        "device_id": device_id, "xp": 0, "completed_quests": [], "check_ins": [],
        "quest_progress": {},
    }
    pois = await repo.pois_list(quest["city_id"])
    dishes = await repo.dishes_list(quest["city_id"])
    result = evaluate_quest_progress(quest, user, pois, city_dishes=dishes)
    return {
        "quest_id": quest_id,
        "completed": quest_id in (user.get("completed_quests") or []),
        "satisfied": result["satisfied"],
        "progress": result["progress"],
    }

@api_router.get("/progress/{device_id}")
async def get_progress(device_id: str):
    doc = await repo.progress_get(device_id)
    if not doc:
        empty = {
            "device_id": device_id, "display_name": "Traveler",
            "xp": 0, "completed_quests": [], "badges": [], "check_ins": [],
            "quest_progress": {}, "avatar_uri": None,
        }
        empty.update(get_level(0))
        return empty
    # Defensive defaults for docs created via profile-only upserts (no check-ins yet)
    doc.setdefault("display_name", "Traveler")
    doc.setdefault("xp", 0)
    doc.setdefault("completed_quests", [])
    doc.setdefault("badges", [])
    doc.setdefault("check_ins", [])
    if doc.get("quest_progress") is None:
        doc["quest_progress"] = {}
    doc.setdefault("avatar_uri", None)
    doc.update(get_level(doc.get("xp", 0)))
    return doc

@api_router.post("/progress/check-in", response_model=CheckInResult)
async def check_in(payload: CheckInPayload, request: Request):
    quest = await repo.quests_get(payload.quest_id)
    if not quest:
        raise HTTPException(404, "Quest not found")

    user = await repo.progress_get(payload.device_id) or {
        "device_id": payload.device_id,
        "display_name": payload.display_name or "Traveler",
        "xp": 0, "completed_quests": [], "badges": [], "check_ins": [],
        "quest_progress": {},
    }
    user.setdefault("xp", 0)
    user.setdefault("completed_quests", [])
    user.setdefault("badges", [])
    user.setdefault("check_ins", [])

    # Anti-cheat: apply the same rate-limit / cooldown / speed gate as the
    # standalone POI check-in endpoint. Only guard when a poi_id is supplied,
    # since some flows (trivia-only completions) don't include one.
    if payload.poi_id:
        gate = anti_cheat.check_pre_gate(
            device_id=payload.device_id,
            request=request,
            last_check_ins=user.get("check_ins") or [],
            poi_id=payload.poi_id,
            lat=payload.lat, lng=payload.lng,
        )
        if not gate.ok:
            raise HTTPException(status_code=429, detail=gate.reason)
    if user.get("quest_progress") is None:
        user["quest_progress"] = {}
    user.setdefault("quest_progress", {})
    # Normalize legacy entries that stored visited POIs as a bare list
    qp_dict = user["quest_progress"] if isinstance(user.get("quest_progress"), dict) else {}
    user["quest_progress"] = qp_dict
    for _qid, _val in list(qp_dict.items()):
        if isinstance(_val, list):
            qp_dict[_qid] = {"visited": _val}
        elif not isinstance(_val, dict):
            qp_dict[_qid] = {"visited": []}

    quest_pois: List[str] = list(quest.get("poi_ids") or [])
    total = len(quest_pois)
    has_trivia = quest.get("trivia") is not None

    # Idempotent: already completed
    if payload.quest_id in user["completed_quests"]:
        lvl = get_level(user["xp"])
        return CheckInResult(
            success=False, xp_earned=0, total_xp=user["xp"],
            level=lvl["level"], level_title=lvl["title"], leveled_up=False,
            quest_completed=True, visited_pois=quest_pois, total_pois=total,
            message="Quest already completed.",
        )

    # Update visited POIs for this quest
    qp = user["quest_progress"].setdefault(payload.quest_id, {"visited": []})
    visited: List[str] = list(qp.get("visited") or [])

    # GPS-distance enforcement: reject if the user is too far from the POI.
    if (
        payload.poi_id
        and payload.poi_id in quest_pois
        and payload.poi_id not in visited
        and payload.lat is not None
        and payload.lng is not None
    ):
        poi_doc = await repo.pois_get(payload.poi_id)
        if poi_doc and poi_doc.get("lat") is not None and poi_doc.get("lng") is not None:
            distance_m = haversine_m(payload.lat, payload.lng, poi_doc["lat"], poi_doc["lng"])
            if distance_m > CHECKIN_RADIUS_M:
                lvl = get_level(user.get("xp", 0))
                pretty = f"{int(round(distance_m))} m" if distance_m < 10000 else f"{distance_m/1000:.1f} km"
                return CheckInResult(
                    success=False, xp_earned=0, total_xp=user.get("xp", 0),
                    level=lvl["level"], level_title=lvl["title"], leveled_up=False,
                    quest_completed=False,
                    visited_pois=visited, total_pois=total,
                    too_far=True, distance_m=int(round(distance_m)),
                    message=f"You're {pretty} from {poi_doc.get('name','this place')}. Walk within {CHECKIN_RADIUS_M} m to check in.",
                )

    if payload.poi_id and payload.poi_id in quest_pois and payload.poi_id not in visited:
        visited.append(payload.poi_id)
    qp["visited"] = visited

    all_visited = total > 0 and set(visited) >= set(quest_pois)

    # Always record this individual check-in
    user["check_ins"].append({
        "quest_id": payload.quest_id, "poi_id": payload.poi_id,
        "lat": payload.lat, "lng": payload.lng,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    user["check_ins"] = anti_cheat.bound_check_ins(user["check_ins"])
    if payload.display_name:
        user["display_name"] = payload.display_name
    if payload.avatar_uri is not None:
        user["avatar_uri"] = payload.avatar_uri
    user["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Still locations to visit?
    if not all_visited:
        await repo.progress_upsert(payload.device_id, user)
        lvl = get_level(user["xp"])
        remaining = total - len(visited)
        return CheckInResult(
            success=True, xp_earned=0, total_xp=user["xp"],
            level=lvl["level"], level_title=lvl["title"], leveled_up=False,
            quest_completed=False, visited_pois=visited, total_pois=total,
            message=f"Checked in! {remaining} location{'s' if remaining != 1 else ''} to go.",
        )

    # All locations visited - handle trivia
    if has_trivia:
        if payload.trivia_answer_index is None:
            await repo.progress_upsert(payload.device_id, user)
            lvl = get_level(user["xp"])
            return CheckInResult(
                success=True, xp_earned=0, total_xp=user["xp"],
                level=lvl["level"], level_title=lvl["title"], leveled_up=False,
                quest_completed=False, awaiting_trivia=True,
                visited_pois=visited, total_pois=total,
                message="All locations visited. Answer the trivia to complete the quest.",
            )
        if payload.trivia_answer_index != quest["trivia"]["correct_index"]:
            await repo.progress_upsert(payload.device_id, user)
            lvl = get_level(user["xp"])
            return CheckInResult(
                success=False, xp_earned=0, total_xp=user["xp"],
                level=lvl["level"], level_title=lvl["title"], leveled_up=False,
                quest_completed=False, awaiting_trivia=True,
                visited_pois=visited, total_pois=total,
                message="Incorrect trivia answer. Try again!",
            )

    # COMPLETE
    prev_level = get_level(user["xp"])["level"]
    xp_earned = int(quest.get("xp_reward", 50))
    user["xp"] = user.get("xp", 0) + xp_earned
    user["completed_quests"].append(payload.quest_id)
    if quest.get("badge_name") and quest["badge_name"] not in user["badges"]:
        user["badges"].append(quest["badge_name"])
    user["quest_progress"].pop(payload.quest_id, None)

    await repo.progress_upsert(payload.device_id, user)

    # City stamp check
    city_stamped = False
    stamped_city_name = None
    city_qids = set(await repo.quests_ids_for_city(quest["city_id"]))
    if city_qids and city_qids.issubset(set(user["completed_quests"])):
        city_stamped = True
        city_doc = await repo.cities_get(quest["city_id"])
        stamped_city_name = city_doc.get("name") if city_doc else None

    new_lvl = get_level(user["xp"])
    return CheckInResult(
        success=True, xp_earned=xp_earned, total_xp=user["xp"],
        level=new_lvl["level"], level_title=new_lvl["title"],
        leveled_up=new_lvl["level"] > prev_level,
        quest_completed=True,
        badge_unlocked=quest.get("badge_name"),
        city_stamped=city_stamped,
        stamped_city_name=stamped_city_name,
        visited_pois=quest_pois, total_pois=total,
        message=f"+{xp_earned} XP — {quest['title']} complete!",
    )

@api_router.get("/progress/{device_id}/by-city")
async def progress_by_city(device_id: str):
    user = await repo.progress_get(device_id) or {}
    completed_set = set(user.get("completed_quests", []))
    check_ins = user.get("check_ins") or []

    cities = await repo.cities_list()
    out = []
    for c in cities:
        all_q_ids = set(await repo.quests_ids_for_city(c["id"]))
        completed_in_city = completed_set & all_q_ids
        total = len(all_q_ids)
        done = len(completed_in_city)
        is_complete = total > 0 and done == total

        stamped_at = None
        if is_complete:
            city_dates = [ci.get("at") for ci in check_ins if ci.get("quest_id") in completed_in_city and ci.get("at")]
            if city_dates:
                stamped_at = max(city_dates)

        out.append({
            "city_id": c["id"],
            "name": c["name"],
            "country": c["country"],
            "country_code": c["country_code"],
            "hero_image": c["hero_image"],
            "total_quests": total,
            "completed_quests": done,
            "percent": round(100 * done / total) if total else 0,
            "completed": is_complete,
            "stamped_at": stamped_at,
        })
    return out


@api_router.post("/progress/{device_id}/profile")
async def update_profile(device_id: str, payload: ProfileUpdatePayload):
    updated = await repo.progress_profile_update(
        device_id,
        display_name=payload.display_name,
        avatar_uri=payload.avatar_uri,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    return {"ok": True, "updated": updated}


@api_router.get("/leaderboard")
async def leaderboard():
    docs = await repo.progress_leaderboard(50)
    out = []
    for d in docs:
        lvl = get_level(d.get("xp", 0))
        out.append({
            "device_id": d.get("device_id"),
            "display_name": d.get("display_name", "Traveler"),
            "avatar_uri": d.get("avatar_uri") or None,
            "xp": d.get("xp", 0),
            "level": lvl["level"],
            "title": lvl["title"],
            "badges": len(d.get("badges") or []),
            "quests": len(d.get("completed_quests") or []),
        })
    return out


# ---------------- AUTH ROUTES ----------------

class LinkDevicePayload(BaseModel):
    device_id: str

@api_router.post("/auth/link-device")
async def link_device(
    payload: LinkDevicePayload,
    claims: Dict[str, Any] = Depends(get_current_user),
):
    """Attach the caller's `user_id` (from JWT) to the existing progress row
    keyed on `device_id`, so anonymous XP/badges carry over to their account.
    """
    uid = user_id_of(claims)
    if not uid:
        raise HTTPException(401, "No user_id in token")
    result = await repo.progress_link_user(payload.device_id, uid)
    if result.get("status") == "conflict":
        raise HTTPException(
            409,
            "This device is already linked to a different account.",
        )
    if result.get("status") == "error":
        raise HTTPException(500, f"Failed to link device: {result.get('error', 'unknown')}")
    return result


@api_router.get("/auth/me")
async def auth_me(claims: Optional[Dict[str, Any]] = Depends(get_optional_user)):
    if not claims:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "user_id": claims.get("sub"),
        "email": claims.get("email"),
        "role": claims.get("role"),
    }


class Dish(BaseModel):
    id: str
    city_id: str
    name: str
    description: str
    image: str
    tags: List[str] = []


@api_router.get("/cities/{city_id}/dishes", response_model=List[Dish])
async def list_dishes(city_id: str):
    docs = await repo.dishes_list(city_id)
    return [Dish(**d) for d in docs]


@api_router.get("/dishes/{dish_id}", response_model=Dish)
async def get_dish(dish_id: str):
    # Dishes are a small set per city; scan the cached list lookup.
    # Iterate all cities (we currently only have ~20 dishes for Gaziantep, others empty).
    for c in await repo.cities_list():
        for d in await repo.dishes_list(c["id"]):
            if d["id"] == dish_id:
                return Dish(**d)
    raise HTTPException(404, "Dish not found")


@api_router.post("/progress/dish-tried", response_model=DishTriedResult)
async def dish_tried(payload: DishTriedPayload):
    """Mark a dish as tasted. Awards +25 XP on first try (idempotent).
    Stores tasted dish ids under `quest_progress.__dishes_tried` (a magic key
    on the existing jsonb column so we don't need a schema change)."""
    user = await repo.progress_get(payload.device_id) or {
        "device_id": payload.device_id,
        "display_name": payload.display_name or "Traveler",
        "xp": 0, "completed_quests": [], "badges": [], "check_ins": [],
        "quest_progress": {},
    }
    user.setdefault("xp", 0)
    user.setdefault("completed_quests", [])
    user.setdefault("badges", [])
    user.setdefault("check_ins", [])
    if user.get("quest_progress") is None:
        user["quest_progress"] = {}
    user.setdefault("quest_progress", {})

    tried_list: List[str] = list(user["quest_progress"].get("__dishes_tried") or [])
    already = payload.dish_id in tried_list

    xp_earned = 0
    leveled_up = False
    if not already:
        tried_list.append(payload.dish_id)
        user["quest_progress"]["__dishes_tried"] = tried_list
        xp_earned = DISH_XP
        prev_level = get_level(user["xp"])["level"]
        user["xp"] = int(user.get("xp") or 0) + xp_earned

        # Recompute flexible quest completion (e.g. Culinary Deep Dive)
        await _recompute_quest_completion(user, "gaziantep")

        leveled_up = get_level(user["xp"])["level"] > prev_level

    if payload.display_name:
        user["display_name"] = payload.display_name
    user["updated_at"] = datetime.now(timezone.utc).isoformat()
    await repo.progress_upsert(payload.device_id, user)

    name = payload.dish_name or payload.dish_id
    if already:
        msg = f"You've already tried {name}."
    else:
        msg = f"Tried {name}! +{xp_earned} XP"
        if leveled_up:
            msg += f" 🎉 Leveled up to {get_level(user['xp'])['title']}!"

    return DishTriedResult(
        success=True,
        already_tried=already,
        xp_earned=xp_earned,
        total_xp=user["xp"],
        tried_dishes=tried_list,
        leveled_up=leveled_up,
        message=msg,
    )


@api_router.get("/supabase/health")
async def supabase_health():
    """Smoke-test the Supabase service-role connection."""
    from supabase_client import get_supabase, data_backend
    sb = get_supabase()
    if not sb:
        return {"configured": False, "data_backend": data_backend(), "message": "Supabase env vars missing"}
    try:
        res = sb.table("cities").select("id", count="exact").limit(1).execute()
        n = res.count if res.count is not None else 0
        return {
            "configured": True,
            "data_backend": data_backend(),
            "cities_rows": n,
            "message": "Connected. Run /app/backend/supabase_schema.sql in the SQL editor next." if n == 0 else "Connected.",
        }
    except Exception as e:
        return {"configured": True, "data_backend": data_backend(), "error": str(e)[:200]}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def on_startup():
    if data_backend() == "supabase":
        logger.info("DATA_BACKEND=supabase → skipping Mongo seed.")
        return
    await seed_if_empty()
    await seed_extra_assets()


# =====================================================================
# CityQuest Verified Score (CVS) — reviews + eligibility + aggregation
# =====================================================================

RESTAURANT_DIMS = ["food", "service", "value", "authenticity"]
OTHER_DIMS      = ["exhibition", "information", "authenticity", "accessibility"]
VERIFY_WINDOW_HOURS = 24
CVS_MIN_REVIEWS = 3

class ReviewIn(BaseModel):
    device_id: str
    overall: int  # 1..5
    dimensions: Dict[str, int]  # e.g. {"food":5,"service":4,...}
    comment: Optional[str] = None

def _dims_for_category(cat: str) -> List[str]:
    return RESTAURANT_DIMS if cat == "restaurant" else OTHER_DIMS

def _has_recent_checkin(user: dict, poi_id: str) -> bool:
    now = datetime.now(timezone.utc)
    for ci in user.get("check_ins") or []:
        if ci.get("poi_id") != poi_id:
            continue
        try:
            at = datetime.fromisoformat(str(ci.get("at")).replace("Z", "+00:00"))
        except Exception:
            continue
        if now - at <= timedelta(hours=VERIFY_WINDOW_HOURS):
            return True
    return False

async def _poi_or_404(poi_id: str) -> Dict[str, Any]:
    poi = await repo.pois_get(poi_id)
    if not poi:
        raise HTTPException(404, "POI not found")
    return poi

@api_router.get("/pois/{poi_id}/reviews/eligibility")
async def review_eligibility(poi_id: str, device_id: str = Query(...)):
    await _poi_or_404(poi_id)
    user = await repo.progress_get(device_id) or {"check_ins": []}
    eligible = _has_recent_checkin(user, poi_id)
    return {"eligible": eligible, "window_hours": VERIFY_WINDOW_HOURS,
            "reason": None if eligible else "Check-in required within the last 24 h."}

@api_router.get("/pois/{poi_id}/reviews")
async def list_reviews(poi_id: str, limit: int = Query(50, le=100)):
    await _poi_or_404(poi_id)
    sb = get_supabase()
    try:
        rows = sb.table("reviews").select("*").eq("poi_id", poi_id).eq("hidden", False) \
            .order("helpful_count", desc=True).order("created_at", desc=True).limit(limit).execute().data or []
    except Exception as e:
        logger.warning("reviews table not ready: %s", e)
        return []
    devs = list({r["device_id"] for r in rows})
    profiles = {p["device_id"]: p for p in
        (sb.table("progress").select("device_id,display_name,avatar_uri,xp")
         .in_("device_id", devs).execute().data or [])}
    return [{**r, "author": profiles.get(r["device_id"], {})} for r in rows]

@api_router.post("/pois/{poi_id}/reviews")
async def create_review(poi_id: str, payload: ReviewIn):
    poi = await _poi_or_404(poi_id)
    if not (1 <= payload.overall <= 5):
        raise HTTPException(400, "overall must be 1..5")
    dims_needed = _dims_for_category(poi.get("category") or "other")
    dims: Dict[str, int] = {}
    for k in dims_needed:
        v = payload.dimensions.get(k)
        if not isinstance(v, int) or not (1 <= v <= 5):
            raise HTTPException(400, f"dimension `{k}` must be 1..5")
        dims[k] = v

    # A short comment is required so reviews carry real signal for other travellers.
    comment_clean = (payload.comment or "").strip()
    if len(comment_clean) < 20:
        raise HTTPException(400, "Comment must be at least 20 characters — tell fellow travellers what you thought.")

    user = await repo.progress_get(payload.device_id) or {"check_ins": []}
    verified = _has_recent_checkin(user, poi_id)
    if not verified:
        raise HTTPException(403, f"Verified visit required within {VERIFY_WINDOW_HOURS}h.")

    sb = get_supabase()
    row = {
        "poi_id": poi_id, "device_id": payload.device_id,
        "overall": payload.overall, "dimensions": dims,
        "comment": comment_clean[:1000],
        "verified": verified,
    }
    result = sb.table("reviews").upsert(row, on_conflict="poi_id,device_id").execute()
    return {"ok": True, "review": (result.data or [row])[0]}

@api_router.get("/pois/{poi_id}/cvs")
async def get_cvs(poi_id: str):
    """CityQuest Verified Score — weighted 60/20/20 (verified reviews / user
    trust proxy / google_rating). Falls back to google_rating when we have
    <3 verified reviews."""
    poi = await _poi_or_404(poi_id)
    sb = get_supabase()
    try:
        rows = sb.table("reviews").select("overall,dimensions").eq("poi_id", poi_id) \
            .eq("hidden", False).limit(500).execute().data or []
    except Exception as e:
        logger.warning("reviews table not ready: %s", e)
        rows = []
    n = len(rows)
    dims_all = _dims_for_category(poi.get("category") or "other")

    # Google rating from POI metadata or top-level `rating` (1..5 → 0..100)
    md = (poi.get("metadata") or {})
    google_raw = md.get("google_rating") or poi.get("rating") or 0
    google_100 = float(google_raw) * 20 if google_raw and google_raw <= 5 else float(google_raw)

    if n == 0:
        return {
            "cvs": round(google_100, 1), "confidence": "low",
            "review_count": 0, "verified_count": 0,
            "cq_score": None, "google_score": round(google_100, 1),
            "user_trust_score": 60, "dimensions": {d: None for d in dims_all},
            "breakdown_weights": {"cityquest": 0.0, "trust": 0.0, "google": 1.0},
        }

    cq_avg  = sum(r["overall"] for r in rows) / n              # 1..5
    cq_100  = cq_avg * 20                                       # 0..100
    dim_avg = {}
    for d in dims_all:
        vals = [r["dimensions"].get(d) for r in rows if r.get("dimensions", {}).get(d)]
        dim_avg[d] = round(sum(vals) / len(vals), 2) if vals else None

    # v1 trust: constant 60 until Phase 2's User Trust Score lands.
    trust_100 = 60.0
    if n >= CVS_MIN_REVIEWS:
        cvs = 0.60 * cq_100 + 0.20 * trust_100 + 0.20 * google_100
        conf, weights = "high", {"cityquest": 0.60, "trust": 0.20, "google": 0.20}
    else:
        # Blend gently while we still have <3 reviews.
        blend = n / CVS_MIN_REVIEWS
        cvs = blend * cq_100 + (1 - blend) * google_100
        conf, weights = "medium", {"cityquest": round(blend, 2), "trust": 0.0, "google": round(1 - blend, 2)}

    return {
        "cvs": round(cvs, 1), "confidence": conf,
        "review_count": n, "verified_count": sum(1 for r in rows if r.get("overall")),
        "cq_score": round(cq_100, 1), "google_score": round(google_100, 1),
        "user_trust_score": trust_100, "dimensions": dim_avg,
        "breakdown_weights": weights,
    }


@app.get("/api/cities/{city_id}/cvs-summary")
async def get_cvs_summary(city_id: str):
    """Returns CityQuest Verified Score for every POI in the city as a compact
    ``{poi_id: score}`` map. Used by list screens (Explore, Food) so we can
    display a single proprietary score per card instead of the raw Google rating.

    Score is computed with the same 60/20/20 (cq / trust / google) blend as
    ``/api/pois/{id}/cvs``, but batched: one review-fetch, one poi-fetch.
    Any POI with no reviews falls back to `google_rating * 20`.
    """
    sb = get_supabase()
    # Fetch all POIs for the city in one round trip (id + rating only).
    pois = (
        sb.table("pois").select("id,rating,metadata").eq("city_id", city_id)
        .limit(2000).execute().data or []
    )
    if not pois:
        return {}

    # Pull all reviews for these POIs in one shot; we compute overall averages
    # locally to avoid N round-trips.
    poi_ids = [p["id"] for p in pois]
    reviews_by_poi: Dict[str, List[Dict[str, Any]]] = {i: [] for i in poi_ids}
    try:
        rows = (
            sb.table("reviews").select("poi_id,overall")
            .in_("poi_id", poi_ids).eq("hidden", False).limit(5000).execute().data or []
        )
        for r in rows:
            reviews_by_poi.setdefault(r["poi_id"], []).append(r)
    except Exception as e:
        logger.warning("cvs-summary: reviews table not ready: %s", e)

    out: Dict[str, float] = {}
    for p in pois:
        md = p.get("metadata") or {}
        google_raw = md.get("google_rating") or p.get("rating") or 0
        google_100 = float(google_raw) * 20 if google_raw and google_raw <= 5 else float(google_raw)
        n = len(reviews_by_poi.get(p["id"], []))
        if n == 0:
            out[p["id"]] = round(google_100, 1)
            continue
        cq_100 = (sum(r["overall"] for r in reviews_by_poi[p["id"]]) / n) * 20
        trust_100 = 60.0
        if n >= CVS_MIN_REVIEWS:
            score = 0.60 * cq_100 + 0.20 * trust_100 + 0.20 * google_100
        else:
            blend = n / CVS_MIN_REVIEWS
            score = blend * cq_100 + (1 - blend) * google_100
        out[p["id"]] = round(score, 1)
    return out


@app.on_event("shutdown")
async def shutdown_db_client():
    # Mongo and Supabase clients are managed lazily; nothing to clean up here.
    return


# IMPORTANT: include the API router LAST so that all endpoints declared above
# (including the CVS reviews block) are actually mounted.
app.include_router(api_router)
