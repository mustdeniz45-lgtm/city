"""
Friends Leaderboard endpoint tests — see review_request from main agent.
Covers:
- GET /api/progress/{new_device_id} no ghost row
- GET /api/progress/{existing} idempotent friend_code
- GET /api/friends/lookup/{code} success/normalization/400/404
- POST /api/friends/leaderboard batch filter + empty
- GET /api/leaderboard sanity
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://local-explorer-game.preview.emergentagent.com"
)
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL/EXPO_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")

WOLFY_DEVICE = "dev_1781112526529_iml7ard2"
WOLFY_CODE = "4B73C0"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- 1. Progress: new device, no ghost row ----------
class TestProgressNoGhost:
    def test_new_device_returns_default_progress(self, client):
        new_dev = f"TEST_ghost_{uuid.uuid4().hex[:12]}"
        r = client.get(f"{BASE_URL}/api/progress/{new_dev}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["device_id"] == new_dev
        assert data.get("xp", 0) == 0
        assert data.get("friend_code") is None, f"Ghost friend_code created: {data.get('friend_code')}"
        # confirm shape
        assert "level" in data and "title" in data

    def test_new_device_get_is_idempotent_and_no_row(self, client):
        """Call GET /progress twice for a fresh device — should NOT persist
        a row (friend_code stays None both times)."""
        new_dev = f"TEST_ghost2_{uuid.uuid4().hex[:12]}"
        r1 = client.get(f"{BASE_URL}/api/progress/{new_dev}").json()
        r2 = client.get(f"{BASE_URL}/api/progress/{new_dev}").json()
        assert r1.get("friend_code") is None
        assert r2.get("friend_code") is None
        # Also ensure leaderboard does not contain this device
        board = client.get(f"{BASE_URL}/api/leaderboard").json()
        assert not any(entry.get("device_id") == new_dev for entry in board)


# ---------- 2. Existing Wolfy row: idempotent friend code ----------
class TestExistingProgress:
    def test_wolfy_friend_code_present_and_idempotent(self, client):
        r1 = client.get(f"{BASE_URL}/api/progress/{WOLFY_DEVICE}")
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert d1.get("friend_code") == WOLFY_CODE, f"Expected {WOLFY_CODE}, got {d1.get('friend_code')}"
        assert d1.get("display_name") == "Wolfy"
        assert d1.get("xp") == 760
        # Idempotent
        r2 = client.get(f"{BASE_URL}/api/progress/{WOLFY_DEVICE}").json()
        assert r2.get("friend_code") == WOLFY_CODE


# ---------- 3. Friends lookup ----------
class TestFriendsLookup:
    def test_lookup_success(self, client):
        r = client.get(f"{BASE_URL}/api/friends/lookup/{WOLFY_CODE}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["friend_code"] == WOLFY_CODE
        assert d["display_name"] == "Wolfy"
        assert d["xp"] == 760
        assert d["level"] == 3
        assert d["title"] == "Bazaar Explorer"

    def test_lookup_normalizes_whitespace_and_lowercase(self, client):
        # request whitespace+lowercase — server needs to normalize
        # Use raw connection because requests strips leading/trailing spaces? Not for url path
        # Use urlencoded space
        r = client.get(f"{BASE_URL}/api/friends/lookup/%204b73c0%20")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["friend_code"] == WOLFY_CODE
        assert d["display_name"] == "Wolfy"

    def test_lookup_too_short_returns_400(self, client):
        r = client.get(f"{BASE_URL}/api/friends/lookup/ABC")
        assert r.status_code == 400, r.text
        assert "Invalid friend code" in r.json().get("detail", "")

    def test_lookup_unknown_returns_404(self, client):
        r = client.get(f"{BASE_URL}/api/friends/lookup/CQ99ZZZZ")
        assert r.status_code == 404, r.text
        assert "No traveler found" in r.json().get("detail", "")


# ---------- 4. Friends batch leaderboard ----------
class TestFriendsBatch:
    def test_batch_filters_invalid_and_unknown(self, client):
        payload = {"codes": [WOLFY_CODE, "CQ99ZZZZ", "xxx"]}
        r = client.post(f"{BASE_URL}/api/friends/leaderboard", json=payload)
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) == 1
        assert rows[0]["friend_code"] == WOLFY_CODE
        assert rows[0]["display_name"] == "Wolfy"

    def test_batch_empty_returns_empty_list(self, client):
        r = client.post(f"{BASE_URL}/api/friends/leaderboard", json={"codes": []})
        assert r.status_code == 200, r.text
        assert r.json() == []

    def test_batch_all_invalid_returns_empty(self, client):
        r = client.post(f"{BASE_URL}/api/friends/leaderboard", json={"codes": ["xx", "y", "12"]})
        assert r.status_code == 200
        assert r.json() == []


# ---------- 5. Global leaderboard sanity ----------
class TestGlobalLeaderboard:
    def test_leaderboard_returns_array_with_expected_shape(self, client):
        r = client.get(f"{BASE_URL}/api/leaderboard")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        # Wolfy should be present
        wolfy = next((e for e in rows if e.get("display_name") == "Wolfy"), None)
        assert wolfy is not None, "Wolfy not on leaderboard"
        assert "xp" in wolfy and "level" in wolfy and "title" in wolfy
        assert isinstance(wolfy["xp"], int) and wolfy["xp"] >= 760
