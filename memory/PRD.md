# CityQuest — Product Requirements

## Vision
A worldwide gamified city guide that turns sightseeing into an XP-earning quest. Tourists discover landmarks, museums, historic sites, must-see places, and famous restaurants through a tactile, magazine-style interface.

## Cities (v1)
- Gaziantep (showcase, deep content)
- Istanbul, Paris, Rome (lighter content)

## Features Implemented
- **5 bottom tabs**: Explore, Map, Quest, Food, Profile
- **City selector** (Gaziantep / Istanbul / Paris / Rome) accessible from the Explore header. **Each city card now shows its quest completion progress** (e.g. `3/3 quests · 100%`) and a green "STAMPED" badge when fully completed.
- **Virtual Passport on Profile**: a compact clickable row (`✈ X / Y cities stamped` with status dots + chevron) opens a dedicated **`/passport` modal screen** listing every city as a full-width row with hero image, country, progress bar, completion ratio, and a tilted red "VISITED · MMM YYYY" ink stamp once all quests in that city are completed. Tapping a row switches the active city and returns to where you came from.
- **Auto-prompt postcard on city stamp**: when the check-in API detects the user just completed the LAST quest in a city, it returns `city_stamped: true` + `stamped_city_name`. The Quest Detail result card then shows a celebratory red "PASSPORT STAMPED · {CITY} · 100%" stamp box with a "Make a postcard" CTA that jumps straight to `/collage` — capturing the dopamine moment for IG/TikTok.
- **Explore**: hero card per city + category chips (All / **Kültür Yolu** / Landmarks / Museums / Historic / Must-See / Food) + POI list
- **Map**: Leaflet (via WebView / iframe on web) with color-coded category pins, popups showing XP, fits bounds
- **Kültür Yolu route overlay** (Gaziantep only): toggleable purple-pin walking route with all 53 sites of the official Gaziantep Culture Path, sequenced 1→53 and connected by a dashed polyline. Each pin shows the Turkish + English name and awards +25 XP per visit.
- **Quest**: difficulty chips (All / Easy / Med / Hard), tactile cover cards, completion badges
- **Quest Detail (multi-POI gated completion)**: every POI in a quest must be checked in individually — each location is rendered as a numbered card with a "Check in here" button + a "Directions" Google Maps shortcut. A progress bar at the top shows `X/Y done`. The trivia is locked behind 100% visit completion; only then does the quest award XP, badge, and (potentially) the city stamp.
- **GPS anti-cheat (150 m radius)**: when the device sends GPS coords with a check-in, the backend computes the Haversine distance to the POI; if outside 150 m the check-in is rejected with a `too_far=true` flag and a friendly "You're 3.3 km from X. Walk within 150 m to check in." message that the app surfaces in an Alert. Missing GPS coords (e.g. permission denied, web demo) still pass to keep the app usable.
- **Live distance badges on POI cards**: when location permission is granted, each POI row in the Quest Detail shows a small pill — green `📍 78 m · in range` when within 150 m, terracotta `🚶 255 m away` when farther. Math mirrors the server so the badge is a reliable preview of whether a check-in will be accepted.
- **Food**: searchable restaurant list with rating + XP
- **Profile**: editable name, tappable avatar (camera or gallery picker, persisted across reloads, **also synced to backend** and shown on leaderboard), XP bar, 7-tier level system (Newcomer → Legend of CityQuest), badges grid, **leaderboard with avatars** (initials-colored circle fallback for users without a custom photo), Postcards gallery, clickable Passport summary row
- **Postcard Maker**: 4 frames including an **XP-Card that embeds the user's avatar** beside the city name + stats, so every shared postcard carries the player's identity.
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
