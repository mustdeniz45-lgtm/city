"""
CityQuest Supabase Backend Regression Suite.

Covers every endpoint listed in the review request:
- /api/supabase/health
- Cities, POIs (+ filters), Kultur Yolu, Food, Dishes
- Quests (+ difficulty filter), single quest, single POI
- /api/progress/poi-check-in (success + GPS too-far)
- /api/progress/check-in (multi-step quest with GPS + trivia)
- /api/progress/{device_id}, /by-city, /profile
- /api/leaderboard

Uses TEST_ok_142021ea as a pre-existing user (75 XP), and AUTO_TEST_<ts> ids
for fresh-user tests.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL"
) else "https://local-explorer-game.preview.emergentagent.com"
API = f"{BASE_URL}/api"

PREEXISTING_DEVICE = "TEST_ok_142021ea"  # 75 XP, q-gaz-1 already completed (per E1)
GAZ_LAT, GAZ_LNG = 37.0734, 37.3818  # Zeugma Museum / poi-gaz-1


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# --------------------------------------------------------------------------
# Supabase health
# --------------------------------------------------------------------------
class TestSupabaseHealth:
    def test_health_configured(self, s):
        r = s.get(f"{API}/supabase/health", timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["configured"] is True
        assert d["data_backend"] == "supabase"
        assert d["cities_rows"] == 4, f"expected 4 cities, got {d.get('cities_rows')}"


# --------------------------------------------------------------------------
# Cities
# --------------------------------------------------------------------------
class TestCities:
    def test_list_returns_four(self, s):
        r = s.get(f"{API}/cities", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 4
        ids = {c["id"] for c in data}
        assert ids == {"gaziantep", "istanbul", "paris", "rome"}
        for c in data:
            assert "_id" not in c
            assert c["poi_count"] > 0
            assert c["quest_count"] > 0

    def test_get_gaziantep(self, s):
        r = s.get(f"{API}/cities/gaziantep", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == "gaziantep"
        assert d["name"] == "Gaziantep"
        assert d["country_code"] == "TR"

    def test_not_found(self, s):
        r = s.get(f"{API}/cities/atlantis", timeout=10)
        assert r.status_code == 404


# --------------------------------------------------------------------------
# POIs
# --------------------------------------------------------------------------
class TestPOIs:
    def test_list_gaziantep_pois(self, s):
        r = s.get(f"{API}/cities/gaziantep/pois", timeout=15)
        assert r.status_code == 200
        pois = r.json()
        # E1 said 164. Allow some tolerance but flag if very off.
        assert len(pois) >= 100, f"expected ~164 POIs, got {len(pois)}"
        for p in pois:
            assert p["city_id"] == "gaziantep"
            assert "_id" not in p

    def test_museum_filter(self, s):
        r = s.get(f"{API}/cities/gaziantep/pois", params={"category": "museum"}, timeout=15)
        assert r.status_code == 200
        pois = r.json()
        assert len(pois) >= 1
        for p in pois:
            assert p["category"] == "museum"

    def test_kultur_yolu_filter(self, s):
        r = s.get(f"{API}/cities/gaziantep/pois", params={"kultur_yolu": "true"}, timeout=15)
        assert r.status_code == 200
        pois = r.json()
        assert len(pois) >= 1
        for p in pois:
            assert p.get("kultur_yolu") is True
            assert p["city_id"] == "gaziantep"

    def test_kultur_yolu_dedicated_endpoint(self, s):
        r = s.get(f"{API}/cities/gaziantep/kultur-yolu", timeout=15)
        assert r.status_code == 200
        ky = r.json()
        # E1 expects 57 KY sites
        assert len(ky) >= 50, f"expected ~57 KY sites, got {len(ky)}"
        for p in ky:
            assert p.get("kultur_yolu") is True
        # Sorted by ky_seq ascending
        seqs = [p.get("ky_seq") for p in ky if p.get("ky_seq") is not None]
        assert seqs == sorted(seqs), "kultur-yolu must be sorted by ky_seq asc"

    def test_food_endpoint(self, s):
        r = s.get(f"{API}/cities/gaziantep/food", timeout=15)
        assert r.status_code == 200
        foods = r.json()
        assert len(foods) >= 1
        for p in foods:
            assert p["category"] == "restaurant"

    def test_get_specific_poi(self, s):
        r = s.get(f"{API}/pois/poi-gaz-1", timeout=10)
        assert r.status_code == 200
        p = r.json()
        assert p["id"] == "poi-gaz-1"
        assert "Zeugma" in p["name"]
        assert p["city_id"] == "gaziantep"
        assert abs(p["lat"] - GAZ_LAT) < 0.001
        assert abs(p["lng"] - GAZ_LNG) < 0.001

    def test_poi_not_found(self, s):
        r = s.get(f"{API}/pois/poi-does-not-exist", timeout=10)
        assert r.status_code == 404


# --------------------------------------------------------------------------
# Dishes
# --------------------------------------------------------------------------
class TestDishes:
    def test_list_dishes(self, s):
        r = s.get(f"{API}/cities/gaziantep/dishes", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 15, f"expected ~20 dishes, got {len(d)}"
        for item in d:
            assert item["city_id"] == "gaziantep"
            assert "name" in item
            assert "_id" not in item


# --------------------------------------------------------------------------
# Quests
# --------------------------------------------------------------------------
class TestQuests:
    def test_list_gaziantep_quests(self, s):
        r = s.get(f"{API}/cities/gaziantep/quests", timeout=10)
        assert r.status_code == 200
        q = r.json()
        assert len(q) == 5, f"expected 5 quests, got {len(q)}"
        for x in q:
            assert x["city_id"] == "gaziantep"
            assert x["difficulty"] in ("easy", "medium", "hard")

    def test_difficulty_filter_easy(self, s):
        r = s.get(f"{API}/cities/gaziantep/quests", params={"difficulty": "easy"}, timeout=10)
        assert r.status_code == 200
        q = r.json()
        assert len(q) >= 1
        for x in q:
            assert x["difficulty"] == "easy"

    def test_get_q_gaz_1_with_trivia(self, s):
        r = s.get(f"{API}/quests/q-gaz-1", timeout=10)
        assert r.status_code == 200
        q = r.json()
        assert q["id"] == "q-gaz-1"
        assert q["title"] == "Mosaic Hunter"
        assert q["xp_reward"] == 75
        assert q["badge_name"] == "Mosaic Eye"
        assert q["trivia"]["correct_index"] == 0
        assert q["poi_ids"] == ["poi-gaz-1"]

    def test_quest_not_found(self, s):
        r = s.get(f"{API}/quests/q-ghost", timeout=10)
        assert r.status_code == 404


# --------------------------------------------------------------------------
# POI Check-in (standalone, not tied to a quest)
# --------------------------------------------------------------------------
class TestPoiCheckIn:
    def test_poi_checkin_good_gps_credits_quest(self, s):
        device = f"AUTO_TEST_poiok_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        r = s.post(
            f"{API}/progress/poi-check-in",
            json={"device_id": device, "poi_id": "poi-gaz-1", "lat": GAZ_LAT, "lng": GAZ_LNG},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is True
        assert d["too_far"] is False
        assert "q-gaz-1" in d["quests_credited"], f"q-gaz-1 should be credited, got {d}"

        # Verify persisted in /progress/{device_id}
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        qp = g.get("quest_progress") or {}
        assert "q-gaz-1" in qp
        assert "poi-gaz-1" in qp["q-gaz-1"].get("visited", [])
        check_ins = g.get("check_ins") or []
        assert any(ci.get("poi_id") == "poi-gaz-1" for ci in check_ins)

    def test_poi_checkin_bad_gps_too_far(self, s):
        device = f"AUTO_TEST_poifar_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        r = s.post(
            f"{API}/progress/poi-check-in",
            json={"device_id": device, "poi_id": "poi-gaz-1", "lat": 0.0, "lng": 0.0},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["success"] is False
        assert d["too_far"] is True
        assert d["distance_m"] is not None and d["distance_m"] > 150

    def test_poi_checkin_missing_poi(self, s):
        r = s.post(
            f"{API}/progress/poi-check-in",
            json={"device_id": "AUTO_TEST_missing", "poi_id": "poi-does-not-exist"},
            timeout=10,
        )
        assert r.status_code == 404


# --------------------------------------------------------------------------
# Quest check-in: GPS gate -> awaiting_trivia -> complete + badge + XP
# --------------------------------------------------------------------------
class TestQuestCheckInFlow:
    def test_full_flow_awards_xp_and_badge(self, s):
        device = f"AUTO_TEST_q_{int(time.time())}_{uuid.uuid4().hex[:4]}"

        # Step 1: GPS-good check-in for poi-gaz-1 -> awaiting_trivia=True
        r1 = s.post(
            f"{API}/progress/check-in",
            json={
                "device_id": device,
                "quest_id": "q-gaz-1",
                "poi_id": "poi-gaz-1",
                "lat": GAZ_LAT,
                "lng": GAZ_LNG,
            },
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1["success"] is True
        assert d1["awaiting_trivia"] is True
        assert d1["quest_completed"] is False
        assert d1["xp_earned"] == 0

        # Step 2: submit correct trivia -> complete
        r2 = s.post(
            f"{API}/progress/check-in",
            json={"device_id": device, "quest_id": "q-gaz-1", "trivia_answer_index": 0},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["success"] is True
        assert d2["quest_completed"] is True
        assert d2["xp_earned"] == 75
        assert d2["total_xp"] == 75
        assert d2["badge_unlocked"] == "Mosaic Eye"

        # Step 3: verify persisted state
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g["xp"] == 75
        assert "q-gaz-1" in g["completed_quests"]
        assert "Mosaic Eye" in g["badges"]
        assert g["level"] == 1
        assert g["title"] == "Newcomer"

    def test_bad_gps_blocks_with_too_far(self, s):
        device = f"AUTO_TEST_qfar_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        r = s.post(
            f"{API}/progress/check-in",
            json={
                "device_id": device,
                "quest_id": "q-gaz-1",
                "poi_id": "poi-gaz-1",
                "lat": 0.0,
                "lng": 0.0,
            },
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is False
        assert d["too_far"] is True
        assert d["distance_m"] > 150
        # Should NOT have advanced visited list
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        qp = (g.get("quest_progress") or {}).get("q-gaz-1") or {}
        assert "poi-gaz-1" not in (qp.get("visited") or [])

    def test_incorrect_trivia_no_xp(self, s):
        device = f"AUTO_TEST_qwr_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        s.post(
            f"{API}/progress/check-in",
            json={
                "device_id": device,
                "quest_id": "q-gaz-1",
                "poi_id": "poi-gaz-1",
                "lat": GAZ_LAT,
                "lng": GAZ_LNG,
            },
            timeout=15,
        )
        r = s.post(
            f"{API}/progress/check-in",
            json={"device_id": device, "quest_id": "q-gaz-1", "trivia_answer_index": 3},
            timeout=15,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is False
        assert d["xp_earned"] == 0
        assert d["quest_completed"] is False
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g["xp"] == 0
        assert "q-gaz-1" not in g["completed_quests"]

    def test_quest_not_found(self, s):
        r = s.post(
            f"{API}/progress/check-in",
            json={"device_id": "AUTO_TEST_x", "quest_id": "q-ghost"},
            timeout=10,
        )
        assert r.status_code == 404


# --------------------------------------------------------------------------
# Progress: GET, by-city, profile
# --------------------------------------------------------------------------
class TestProgressEndpoints:
    def test_pre_existing_user_has_xp(self, s):
        """E1 said TEST_ok_142021ea has 75 XP. Tolerate if cleaned up."""
        r = s.get(f"{API}/progress/{PREEXISTING_DEVICE}", timeout=10)
        assert r.status_code == 200
        d = r.json()
        # Should contain the standard shape
        for k in ("xp", "level", "title", "completed_quests", "badges", "check_ins", "quest_progress"):
            assert k in d, f"missing field {k}"
        # If still present in seed:
        if d["xp"] > 0:
            assert d["xp"] >= 75
            assert d["level"] >= 1

    def test_empty_progress_new_device(self, s):
        device = f"AUTO_TEST_new_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        r = s.get(f"{API}/progress/{device}", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["xp"] == 0
        assert d["level"] == 1
        assert d["title"] == "Newcomer"
        assert d["completed_quests"] == []
        assert d["badges"] == []

    def test_by_city_progress_shape(self, s):
        device = f"AUTO_TEST_bc_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        # New device — all percent=0
        r = s.get(f"{API}/progress/{device}/by-city", timeout=10)
        assert r.status_code == 200
        cities = r.json()
        assert isinstance(cities, list)
        assert len(cities) == 4
        for c in cities:
            for k in (
                "city_id", "name", "country", "country_code", "hero_image",
                "total_quests", "completed_quests", "percent", "completed", "stamped_at",
            ):
                assert k in c
            assert c["completed_quests"] == 0
            assert c["percent"] == 0
            assert c["completed"] is False

    def test_profile_upsert_creates_row(self, s):
        device = f"AUTO_TEST_prof_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        r = s.post(
            f"{API}/progress/{device}/profile",
            json={"display_name": "Halil Tester"},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert "display_name" in body["updated"]
        # Confirm persisted
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g["display_name"] == "Halil Tester"

    def test_profile_update_existing(self, s):
        device = f"AUTO_TEST_prof2_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        s.post(f"{API}/progress/{device}/profile", json={"display_name": "Original"}, timeout=10)
        r = s.post(
            f"{API}/progress/{device}/profile",
            json={"display_name": "Renamed", "avatar_uri": "https://example.com/a.png"},
            timeout=10,
        )
        assert r.status_code == 200
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g["display_name"] == "Renamed"
        assert g["avatar_uri"] == "https://example.com/a.png"


# --------------------------------------------------------------------------
# Leaderboard
# --------------------------------------------------------------------------
class TestLeaderboard:
    def test_sorted_desc_and_shape(self, s):
        r = s.get(f"{API}/leaderboard", timeout=15)
        assert r.status_code == 200
        lb = r.json()
        assert isinstance(lb, list)
        assert len(lb) <= 50
        xps = [u["xp"] for u in lb]
        assert xps == sorted(xps, reverse=True), "leaderboard must be sorted by xp desc"
        if lb:
            for k in ("device_id", "display_name", "xp", "level", "title", "badges", "quests"):
                assert k in lb[0], f"missing field {k}"
