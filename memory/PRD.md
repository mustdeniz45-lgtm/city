# CityQuest — Product Requirements

## Vision
A worldwide gamified city guide that turns sightseeing into an XP-earning quest. Tourists discover landmarks, museums, historic sites, must-see places, and famous restaurants through a tactile, magazine-style interface.

## Cities (v1)
- Gaziantep (showcase, deep content)
- Istanbul, Paris, Rome (lighter content)

## Features Implemented
- **5 bottom tabs**: Explore, Map, Quest, Food, Profile
- **City selector** (Gaziantep / Istanbul / Paris / Rome) accessible from the Explore header. **Each city card now shows its quest completion progress** (e.g. `3/3 quests · 100%`) and a green "STAMPED" badge when fully completed.
- **Virtual Passport on Profile**: Continent Passport summary row (`✈ X / Y cities stamped` with status dots), then 2×2 grid of cities with hero image, country code, progress bar, and a tilted red "VISITED · MMM YYYY" ink stamp once all quests in a city are completed.
- **Auto-prompt postcard on city stamp**: when the check-in API detects the user just completed the LAST quest in a city, it returns `city_stamped: true` + `stamped_city_name`. The Quest Detail result card then shows a celebratory red "PASSPORT STAMPED · {CITY} · 100%" stamp box with a "Make a postcard" CTA that jumps straight to `/collage` — capturing the dopamine moment for IG/TikTok.
- **Explore**: hero card per city + category chips (All / **Kültür Yolu** / Landmarks / Museums / Historic / Must-See / Food) + POI list
- **Map**: Leaflet (via WebView / iframe on web) with color-coded category pins, popups showing XP, fits bounds
- **Kültür Yolu route overlay** (Gaziantep only): toggleable purple-pin walking route with all 53 sites of the official Gaziantep Culture Path, sequenced 1→53 and connected by a dashed polyline. Each pin shows the Turkish + English name and awards +25 XP per visit.
- **Quest**: difficulty chips (All / Easy / Med / Hard), tactile cover cards, completion badges
- **Quest Detail**: hero + GPS check-in (expo-location) + optional trivia + XP/level-up/badge result card
- **Food**: searchable restaurant list with rating + XP
- **Profile**: editable name, avatar, XP bar, 7-tier level system (Newcomer → Legend of CityQuest), badges grid, leaderboard, **Postcards gallery** (long-press to delete)
- **Postcard Maker** (`/collage`): take photo OR pick from library → 4 frames (Postcard / Polaroid / Magazine / XP Card) → optional caption → save to device gallery + share via system sheet to IG / TikTok / X / WhatsApp. Camera + media-library permissions handled progressively with Settings fallback. Captures use `react-native-view-shot`.
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
