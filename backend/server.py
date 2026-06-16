"""
CityQuest backend — gamified worldwide city guide.
- No-auth, device-id based user progress.
- Seeds 4 cities (Gaziantep deep; Istanbul, Paris, Rome lighter) on startup.
"""
from fastapi import FastAPI, APIRouter, HTTPException, Query, Depends
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
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# Mongo is only created when actually needed (the `repo` layer requests it lazily).
# This avoids opening an idle Mongo connection when DATA_BACKEND=supabase.

import repo  # data-access layer (selects Mongo vs Supabase via DATA_BACKEND env)
from supabase_client import data_backend
from auth import get_current_user, get_optional_user, user_id_of

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
    # Gaziantep
    pois += [
        {"id":"poi-gaz-1","city_id":gaz,"name":"Zeugma Mosaic Museum","category":"museum",
         "description":"Home to the iconic 'Gypsy Girl' mosaic and the world's largest collection of Roman mosaics.",
         "image":"https://images.unsplash.com/photo-1712263806377-beac33b9ae3a?w=800&q=80","lat":37.0734,"lng":37.3818,"rating":4.8,"xp_reward":90},
        {"id":"poi-gaz-2","city_id":gaz,"name":"Gaziantep Castle","category":"historic",
         "description":"A Roman-era hilltop fortress overlooking the old city, rebuilt after the 2023 earthquake.",
         "image":"https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80","lat":37.0644,"lng":37.3822,"rating":4.5,"xp_reward":60},
        {"id":"poi-gaz-3","city_id":gaz,"name":"Bakırcılar Çarşısı (Coppersmith Bazaar)","category":"must-see",
         "description":"Centuries-old covered bazaar where copper artisans still hammer trays and pots by hand.",
         "image":"https://images.unsplash.com/photo-1555992828-35627f3eea4d?w=800&q=80","lat":37.0639,"lng":37.3791,"rating":4.7,"xp_reward":55},
        {"id":"poi-gaz-4","city_id":gaz,"name":"Şirvani Mosque","category":"historic",
         "description":"15th-century mosque with intricate mihrab carvings and serene courtyard.",
         "image":"https://images.unsplash.com/photo-1591019479261-1a103585c559?w=800&q=80","lat":37.0631,"lng":37.3808,"rating":4.4,"xp_reward":45},
        {"id":"poi-gaz-5","city_id":gaz,"name":"Emine Göğüş Cuisine Museum","category":"museum",
         "description":"A culinary museum dedicated to the UNESCO-recognized Gaziantep gastronomy heritage.",
         "image":"https://images.unsplash.com/photo-1567521464027-f127ff144326?w=800&q=80","lat":37.0648,"lng":37.3805,"rating":4.6,"xp_reward":70},
        {"id":"poi-gaz-6","city_id":gaz,"name":"İmam Çağdaş Restaurant","category":"restaurant",
         "description":"Legendary kebab and baklava house operating since 1887 in the old bazaar.",
         "image":"https://images.unsplash.com/photo-1598110750624-207050c4f28c?w=800&q=80","lat":37.0641,"lng":37.3795,"rating":4.9,"xp_reward":60},
        {"id":"poi-gaz-7","city_id":gaz,"name":"Tahmis Coffee House","category":"restaurant",
         "description":"Historic 17th-century coffee house serving menengiç coffee in a stone-vaulted hall.",
         "image":"https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80","lat":37.0640,"lng":37.3799,"rating":4.7,"xp_reward":45},
    ]
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
         "difficulty":"easy","category":"museum","xp_reward":75,"poi_ids":["poi-gaz-1"],
         "cover_image":"https://images.unsplash.com/photo-1712263806377-beac33b9ae3a?w=800&q=80","estimated_minutes":60,"badge_name":"Mosaic Eye",
         "trivia":{"question":"Which iconic mosaic is displayed at the Zeugma Museum?","options":["Gypsy Girl","Alexander Mosaic","Bird & Snake","Hercules"],"correct_index":0}},
        {"id":"q-gaz-2","city_id":gaz,"title":"Baklava Master","description":"Taste authentic Antep baklava at İmam Çağdaş.",
         "difficulty":"easy","category":"food","xp_reward":60,"poi_ids":["poi-gaz-6"],
         "cover_image":"https://images.unsplash.com/photo-1598110750624-207050c4f28c?w=800&q=80","estimated_minutes":30,"badge_name":"Baklava Master",
         "trivia":{"question":"Which nut traditionally fills Antep baklava?","options":["Walnut","Almond","Antep Pistachio","Hazelnut"],"correct_index":2}},
        {"id":"q-gaz-3","city_id":gaz,"title":"Coppersmith Wanderer","description":"Explore the Bakırcılar Bazaar and observe artisans at work.",
         "difficulty":"medium","category":"must-see","xp_reward":100,"poi_ids":["poi-gaz-3","poi-gaz-7"],
         "cover_image":"https://images.unsplash.com/photo-1555992828-35627f3eea4d?w=800&q=80","estimated_minutes":90,"badge_name":"Bazaar Explorer",
         "trivia":{"question":"What metal is the bazaar famous for?","options":["Silver","Copper","Bronze","Gold"],"correct_index":1}},
        {"id":"q-gaz-4","city_id":gaz,"title":"Castle of Antep","description":"Climb the Gaziantep Castle and discover its Roman roots.",
         "difficulty":"medium","category":"historic","xp_reward":90,"poi_ids":["poi-gaz-2"],
         "cover_image":"https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&q=80","estimated_minutes":75,"badge_name":"Castle Climber",
         "trivia":{"question":"Which empire originally built Gaziantep Castle?","options":["Ottoman","Hittite","Roman","Byzantine"],"correct_index":2}},
        {"id":"q-gaz-5","city_id":gaz,"title":"Antep Heritage Trail","description":"Complete a full circuit of the old city's historic mosques and museums.",
         "difficulty":"hard","category":"historic","xp_reward":150,"poi_ids":["poi-gaz-4","poi-gaz-5","poi-gaz-2"],
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
        logger.info("Base seed complete.")
    else:
        logger.info(f"DB already seeded: {count} cities")

    # Kültür Yolu seed (idempotent)
    ky_count = await db.pois.count_documents({"city_id": "gaziantep", "kultur_yolu": True})
    if ky_count == 0:
        from kultur_yolu_data import KULTUR_YOLU, KY_IMAGE_BY_CAT
        docs = []
        for item in KULTUR_YOLU:
            cat = item["cat"]
            docs.append({
                "id": f"poi-gaz-ky-{item['n']:02d}",
                "city_id": "gaziantep",
                "name": item["en"],
                "name_tr": item["tr"],
                "category": cat,
                "description": f"Site #{item['n']} on the Gaziantep Kultur Yolu (Culture Path) - {item['tr']}.",
                "image": KY_IMAGE_BY_CAT.get(cat, KY_IMAGE_BY_CAT["historic"]),
                "lat": item["lat"],
                "lng": item["lng"],
                "rating": 4.4,
                "xp_reward": 25,
                "kultur_yolu": True,
                "ky_seq": item["n"],
            })
        await db.pois.insert_many(docs)
        logger.info(f"Inserted {len(docs)} Kultur Yolu sites.")

    # Refresh poi/quest counts on every startup so cities reflect KY additions
    for c in await db.cities.find({}, {"_id": 0}).to_list(50):
        poi_count = await db.pois.count_documents({"city_id": c["id"]})
        quest_count = await db.quests.count_documents({"city_id": c["id"]})
        await db.cities.update_one(
            {"id": c["id"]},
            {"$set": {"poi_count": poi_count, "quest_count": quest_count}},
        )


async def seed_extra_assets():
    """Seed the user-uploaded gaziantep_yemekleri + kultur_yolu_kategorize datasets."""
    from extra_seeds import load_dishes, load_categorized_pois, _normalize
    db = repo._mongo()
    # Dishes (separate collection — they don't have GPS / aren't check-in POIs).
    if await db.dishes.count_documents({"city_id": "gaziantep"}) == 0:
        dishes = load_dishes()
        if dishes:
            await db.dishes.insert_many(dishes)
            logger.info(f"Inserted {len(dishes)} Gaziantep dishes.")

    # Categorized POIs (skip those already present by TR/EN name).
    if await db.pois.count_documents({"city_id": "gaziantep", "source": "ky_cat"}) == 0:
        existing = await db.pois.find(
            {"city_id": "gaziantep"}, {"_id": 0, "name": 1, "name_tr": 1}
        ).to_list(5000)
        existing_names = set()
        for e in existing:
            if e.get("name_tr"):
                existing_names.add(_normalize(e["name_tr"]))
            if e.get("name"):
                existing_names.add(_normalize(e["name"]))
        cat_docs = load_categorized_pois(existing_names)
        if cat_docs:
            await db.pois.insert_many(cat_docs)
            logger.info(f"Inserted {len(cat_docs)} categorized POIs from kultur_yolu_kategorize.")
            # Refresh city poi_count
            poi_count = await db.pois.count_documents({"city_id": "gaziantep"})
            await db.cities.update_one({"id": "gaziantep"}, {"$set": {"poi_count": poi_count}})

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


@api_router.post("/progress/poi-check-in", response_model=PoiCheckInResult)
async def poi_check_in(payload: PoiCheckInPayload):
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
    user.setdefault("quest_progress", {}) or user.update({"quest_progress": {}})
    if user.get("quest_progress") is None:
        user["quest_progress"] = {}

    # Has the user already visited this POI in any quest context?
    already = any(payload.poi_id in (qp.get("visited") or []) for qp in user["quest_progress"].values())

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

    user["check_ins"].append({
        "quest_id": None,
        "poi_id": payload.poi_id,
        "lat": payload.lat, "lng": payload.lng,
        "at": datetime.now(timezone.utc).isoformat(),
    })
    if payload.display_name:
        user["display_name"] = payload.display_name
    user["updated_at"] = datetime.now(timezone.utc).isoformat()

    await repo.progress_upsert(payload.device_id, user)

    n = len(credited)
    if n == 0 and already:
        msg = f"You've already checked in at {poi['name']}."
    elif n == 0:
        msg = f"Visit recorded at {poi['name']}!"
    elif n == 1:
        msg = f"Visited {poi['name']}! Counted toward 1 quest."
    else:
        msg = f"Visited {poi['name']}! Counted toward {n} quests."

    return PoiCheckInResult(
        success=True, too_far=False,
        quests_credited=credited, already_visited=already and n == 0,
        message=msg,
    )


@api_router.get("/cities/{city_id}/quests", response_model=List[Quest])
async def list_quests(city_id: str, difficulty: Optional[str] = Query(None)):
    docs = await repo.quests_list(city_id, difficulty=difficulty)
    return [Quest(**d) for d in docs]

@api_router.get("/quests/{quest_id}", response_model=Quest)
async def get_quest(quest_id: str):
    doc = await repo.quests_get(quest_id)
    if not doc:
        raise HTTPException(404, "Quest not found")
    return Quest(**doc)

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
async def check_in(payload: CheckInPayload):
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
    if user.get("quest_progress") is None:
        user["quest_progress"] = {}
    user.setdefault("quest_progress", {})

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


app.include_router(api_router)


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


@app.on_event("shutdown")
async def shutdown_db_client():
    # Mongo and Supabase clients are managed lazily; nothing to clean up here.
    return
