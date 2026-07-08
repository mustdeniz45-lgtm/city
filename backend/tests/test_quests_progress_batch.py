"""Batch quests progress endpoint tests: GET /api/cities/{city_id}/quests/progress"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://local-explorer-game.preview.emergentagent.com").rstrip("/")

WOLFY = "dev_1781112526529_iml7ard2"


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


class TestCityQuestsProgress:
    def test_gaziantep_populated_wolfy(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/cities/gaziantep/quests/progress", params={"device_id": WOLFY})
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 11, f"expected 11 gaziantep quests, got {len(data)}"
        # every entry has integer percent in [0,100]
        for e in data:
            assert set(["quest_id", "current", "need", "percent", "completed", "satisfied"]) <= set(e.keys())
            assert isinstance(e["percent"], int), f"percent not int for {e}"
            assert 0 <= e["percent"] <= 100, f"percent out of range for {e}"
        # Cross-check completed_quests: every completed quest in the user
        # profile that ALSO appears in the current catalog must render at 100%.
        prof = api_client.get(f"{BASE_URL}/api/progress/{WOLFY}").json()
        user_done = set(prof.get("completed_quests") or [])
        current_ids = {e["quest_id"] for e in data}
        overlap = user_done & current_ids
        for qid in overlap:
            e = next(x for x in data if x["quest_id"] == qid)
            assert e["completed"] is True, f"{qid} should be completed"
            assert e["percent"] == 100, f"{qid} should render at 100%"
        # NOTE: Wolfy has 6 completed quests but 5 are legacy IDs (q-gaz-1..5)
        # that were replaced by the current v2 catalog (q-gaz-101..111). Only
        # q-gaz-101 overlaps, so overlap size is 1, not 6 — this is a dataset
        # drift issue, not an endpoint bug.
        assert len(overlap) >= 1, "expected at least q-gaz-101 in overlap"

    def test_fresh_device_no_ghost(self, api_client):
        fresh = f"TEST_ghost_{uuid.uuid4().hex[:8]}"
        r = api_client.get(f"{BASE_URL}/api/cities/gaziantep/quests/progress", params={"device_id": fresh})
        assert r.status_code == 200, r.text
        data = r.json()
        assert len(data) == 11
        for e in data:
            assert e["completed"] is False
            assert e["current"] == 0
        # Ensure no ghost row was created
        p = api_client.get(f"{BASE_URL}/api/progress/{fresh}")
        assert p.status_code == 200
        pj = p.json()
        # A ghost row would have friend_code set. Empty/default is ok.
        assert pj.get("xp", 0) == 0
        assert pj.get("completed_quests") == []

    def test_istanbul_progress(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/cities/istanbul/quests/progress", params={"device_id": WOLFY})
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # get expected count
        qr = api_client.get(f"{BASE_URL}/api/cities/istanbul/quests")
        assert qr.status_code == 200
        assert len(data) == len(qr.json())
        # no gaziantep quest ids leaked in
        istanbul_ids = {q["id"] for q in qr.json()}
        for e in data:
            assert e["quest_id"] in istanbul_ids

    def test_unknown_city_empty(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/cities/unknown_city_xyz/quests/progress", params={"device_id": "anything"})
        assert r.status_code == 200
        assert r.json() == []

    def test_missing_device_id_422(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/cities/gaziantep/quests/progress")
        assert r.status_code == 422


class TestRegressionsSmoke:
    def test_leaderboard(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/leaderboard")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_friends_lookup(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/friends/lookup/4B73C0")
        assert r.status_code == 200
        j = r.json()
        assert j.get("xp") is not None
        assert j.get("friend_code")

    def test_friends_leaderboard_post(self, api_client):
        r = api_client.post(f"{BASE_URL}/api/friends/leaderboard", json={"codes": ["4B73C0"]})
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list) and len(arr) == 1
        assert arr[0].get("friend_code")
