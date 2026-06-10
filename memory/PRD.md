# CityQuest — Product Requirements

## Vision
A worldwide gamified city guide that turns sightseeing into an XP-earning quest. Tourists discover landmarks, museums, historic sites, must-see places, and famous restaurants through a tactile, magazine-style interface.

## Cities (v1)
- Gaziantep (showcase, deep content)
- Istanbul, Paris, Rome (lighter content)

## Features Implemented
- **5 bottom tabs**: Explore, Map, Quest, Food, Profile
- **City selector** (Gaziantep / Istanbul / Paris / Rome) accessible from the Explore header
- **Explore**: hero card per city + category chips (All / Landmarks / Museums / Historic / Must-See / Food) + POI list
- **Map**: Leaflet (via WebView) with color-coded category pins, popups showing XP, fits bounds
- **Quest**: difficulty chips (All / Easy / Med / Hard), tactile cover cards, completion badges
- **Quest Detail**: hero + GPS check-in (expo-location) + optional trivia + XP/level-up/badge result card
- **Food**: searchable restaurant list with rating + XP
- **Profile**: editable name, avatar, XP bar, 7-tier level system (Newcomer → Legend of CityQuest), badges grid, leaderboard
- **No auth** — device_id stored in AsyncStorage; progress persisted server-side and globally ranked

## Backend Endpoints (all `/api/*`)
- `GET /cities`, `GET /cities/{id}`
- `GET /cities/{id}/pois?category=`, `GET /cities/{id}/food`
- `GET /cities/{id}/quests?difficulty=`, `GET /quests/{id}`
- `GET /progress/{device_id}`, `POST /progress/check-in`
- `GET /leaderboard`

## Design
- Personality: Editorial Mobile LIGHT + Tactile gamification
- Palette: Terracotta `#C85A40`, Ochre `#D9953A`, Olive `#6B705C` on warm off-white
- Display font: serif (Georgia/serif); Body: system sans
- 5 tabs with blur on iOS, opaque on Android

## Out of scope (v1)
- Authentication
- AI travel companion
- Push notifications
- Multi-language (EN only)
- Photo uploads, social reviews
