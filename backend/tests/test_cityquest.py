"""CityQuest backend test suite - cities, POIs, quests, progress, leaderboard."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-explorer-game.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ----- Cities -----
class TestCities:
    def test_list_cities_returns_four(self, s):
        r = s.get(f"{API}/cities", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 4, f"Expected 4 cities, got {len(data)}"
        ids = {c["id"] for c in data}
        assert {"gaziantep", "istanbul", "paris", "rome"} == ids
        for c in data:
            assert c["poi_count"] > 0
            assert c["quest_count"] > 0
            assert "_id" not in c

    def test_get_city_detail(self, s):
        r = s.get(f"{API}/cities/gaziantep", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Gaziantep"
        assert d["country_code"] == "TR"

    def test_get_city_not_found(self, s):
        r = s.get(f"{API}/cities/atlantis", timeout=10)
        assert r.status_code == 404


# ----- POIs -----
class TestPOIs:
    def test_list_pois_gaziantep(self, s):
        r = s.get(f"{API}/cities/gaziantep/pois", timeout=10)
        assert r.status_code == 200
        pois = r.json()
        assert len(pois) >= 7
        for p in pois:
            assert p["city_id"] == "gaziantep"
            assert "_id" not in p

    def test_pois_category_filter_museum(self, s):
        r = s.get(f"{API}/cities/gaziantep/pois", params={"category": "museum"}, timeout=10)
        assert r.status_code == 200
        pois = r.json()
        assert len(pois) >= 1
        for p in pois:
            assert p["category"] == "museum"

    def test_pois_category_filter_restaurant(self, s):
        r = s.get(f"{API}/cities/gaziantep/pois", params={"category": "restaurant"}, timeout=10)
        assert r.status_code == 200
        for p in r.json():
            assert p["category"] == "restaurant"

    def test_pois_category_all(self, s):
        r_all_param = s.get(f"{API}/cities/gaziantep/pois", params={"category": "all"}, timeout=10)
        r_nofilter = s.get(f"{API}/cities/gaziantep/pois", timeout=10)
        assert r_all_param.status_code == 200 and r_nofilter.status_code == 200
        assert len(r_all_param.json()) == len(r_nofilter.json())

    def test_food_endpoint_only_restaurants(self, s):
        r = s.get(f"{API}/cities/gaziantep/food", timeout=10)
        assert r.status_code == 200
        foods = r.json()
        assert len(foods) >= 1
        for p in foods:
            assert p["category"] == "restaurant"


# ----- Quests -----
class TestQuests:
    def test_list_quests_gaziantep(self, s):
        r = s.get(f"{API}/cities/gaziantep/quests", timeout=10)
        assert r.status_code == 200
        quests = r.json()
        assert len(quests) >= 5
        for q in quests:
            assert q["city_id"] == "gaziantep"
            assert q["difficulty"] in ("easy", "medium", "hard")

    def test_quests_difficulty_filter(self, s):
        r = s.get(f"{API}/cities/gaziantep/quests", params={"difficulty": "easy"}, timeout=10)
        assert r.status_code == 200
        quests = r.json()
        assert len(quests) >= 1
        for q in quests:
            assert q["difficulty"] == "easy"

    def test_get_quest_with_trivia(self, s):
        r = s.get(f"{API}/quests/q-gaz-1", timeout=10)
        assert r.status_code == 200
        q = r.json()
        assert q["id"] == "q-gaz-1"
        assert q["trivia"] is not None
        assert "question" in q["trivia"]
        assert len(q["trivia"]["options"]) == 4
        assert isinstance(q["trivia"]["correct_index"], int)

    def test_quest_not_found(self, s):
        r = s.get(f"{API}/quests/does-not-exist", timeout=10)
        assert r.status_code == 404


# ----- Progress / Check-in -----
class TestProgress:
    def test_empty_progress_new_device(self, s):
        device = f"TEST_new_{uuid.uuid4().hex[:8]}"
        r = s.get(f"{API}/progress/{device}", timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["xp"] == 0
        assert d["level"] == 1
        assert d["title"] == "Newcomer"
        assert d["completed_quests"] == []
        assert d["badges"] == []

    def test_checkin_correct_answer_awards_xp(self, s):
        device = f"TEST_ok_{uuid.uuid4().hex[:8]}"
        # q-gaz-1 has 1 POI (poi-gaz-1), correct_index is 0, xp 75
        # First visit the POI, then submit trivia.
        s.post(f"{API}/progress/check-in", json={
            "device_id": device, "quest_id": "q-gaz-1", "poi_id": "poi-gaz-1",
        }, timeout=15)
        r = s.post(f"{API}/progress/check-in", json={
            "device_id": device, "quest_id": "q-gaz-1", "trivia_answer_index": 0,
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["xp_earned"] == 75
        assert data["total_xp"] == 75
        assert data["quest_completed"] is True
        assert data["badge_unlocked"] == "Mosaic Eye"
        # GET progress should reflect persisted state
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g["xp"] == 75
        assert "q-gaz-1" in g["completed_quests"]
        assert "Mosaic Eye" in g["badges"]

    def test_checkin_idempotent_on_repeat(self, s):
        device = f"TEST_idem_{uuid.uuid4().hex[:8]}"
        # q-gaz-2 has 1 POI (poi-gaz-6), correct trivia is index 2
        s.post(f"{API}/progress/check-in", json={
            "device_id": device, "quest_id": "q-gaz-2", "poi_id": "poi-gaz-6",
        }, timeout=15)
        r1 = s.post(f"{API}/progress/check-in", json={
            "device_id": device, "quest_id": "q-gaz-2", "trivia_answer_index": 2,
        }, timeout=15)
        assert r1.status_code == 200 and r1.json()["success"] is True
        first_xp = r1.json()["total_xp"]
        # repeat (full payload) - should be idempotent
        r2 = s.post(f"{API}/progress/check-in", json={
            "device_id": device, "quest_id": "q-gaz-2", "poi_id": "poi-gaz-6", "trivia_answer_index": 2,
        }, timeout=15)
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["success"] is False
        assert d2["xp_earned"] == 0
        assert d2["total_xp"] == first_xp
        assert "already" in d2["message"].lower()

    def test_checkin_incorrect_trivia_no_xp(self, s):
        device = f"TEST_wrong_{uuid.uuid4().hex[:8]}"
        # Visit the POI, then send wrong trivia
        s.post(f"{API}/progress/check-in", json={
            "device_id": device, "quest_id": "q-gaz-1", "poi_id": "poi-gaz-1",
        }, timeout=15)
        r = s.post(f"{API}/progress/check-in", json={
            "device_id": device, "quest_id": "q-gaz-1", "trivia_answer_index": 3,
        }, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is False
        assert d["xp_earned"] == 0
        assert d["total_xp"] == 0
        assert d["quest_completed"] is False
        # Verify NOT awarded XP / NOT completed
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g["xp"] == 0
        assert g["completed_quests"] == []

    def test_leveled_up_flag(self, s):
        # Level 2 threshold is 150 XP. We complete two quests to cross it.
        device = f"TEST_lvl_{uuid.uuid4().hex[:8]}"
        # q-gaz-1 (1 POI) = 75 xp, q-gaz-3 (2 POIs) = 100 xp -> 175 should hit level 2
        s.post(f"{API}/progress/check-in", json={"device_id": device, "quest_id": "q-gaz-1", "poi_id": "poi-gaz-1"}, timeout=15)
        r1 = s.post(f"{API}/progress/check-in", json={"device_id": device, "quest_id": "q-gaz-1", "trivia_answer_index": 0}, timeout=15).json()
        assert r1["level"] == 1
        assert r1["leveled_up"] is False
        # q-gaz-3 has 2 POIs (poi-gaz-3, poi-gaz-7) + trivia idx 1
        s.post(f"{API}/progress/check-in", json={"device_id": device, "quest_id": "q-gaz-3", "poi_id": "poi-gaz-3"}, timeout=15)
        s.post(f"{API}/progress/check-in", json={"device_id": device, "quest_id": "q-gaz-3", "poi_id": "poi-gaz-7"}, timeout=15)
        r2 = s.post(f"{API}/progress/check-in", json={"device_id": device, "quest_id": "q-gaz-3", "trivia_answer_index": 1}, timeout=15).json()
        assert r2["total_xp"] == 175
        assert r2["level"] == 2
        assert r2["leveled_up"] is True
        assert r2["level_title"] == "Curious Traveller"

    def test_checkin_quest_not_found(self, s):
        r = s.post(f"{API}/progress/check-in", json={"device_id": "x", "quest_id": "ghost"}, timeout=10)
        assert r.status_code == 404


# ----- Leaderboard -----
class TestLeaderboard:
    def test_leaderboard_sorted_desc(self, s):
        r = s.get(f"{API}/leaderboard", timeout=10)
        assert r.status_code == 200
        lb = r.json()
        assert isinstance(lb, list)
        xps = [u["xp"] for u in lb]
        assert xps == sorted(xps, reverse=True)
        if lb:
            u0 = lb[0]
            for k in ("device_id", "display_name", "xp", "level", "title", "badges", "quests"):
                assert k in u0
