"""
CityQuest Phase A — Supabase Auth backend tests.

Covers:
- GET  /api/auth/me      — no token, invalid token, valid token
- POST /api/auth/link-device — no token (401), brand-new device (created),
                               existing device w/o user_id (linked),
                               idempotent re-link (already),
                               device owned by a different user (409 conflict)
- Regression: GET /api/cities, /api/cities/gaziantep/pois,
              /api/cities/gaziantep/quests, /api/leaderboard still work
              after auth.py was added (DATA_BACKEND=supabase).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "https://local-explorer-game.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

SUPABASE_URL = "https://qhnmbctcdetpjsgjkzrw.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_sHIGuXIEqJVxfFjqK_s0Ow_HjmyHKPr"
SUPABASE_SERVICE_KEY = "sb_secret_z-wY8HJu23D6m43iC5Bm2Q_4ZmRgV5z"

PRIMARY_EMAIL = "testuser_1781344899@cityquest.app"
PRIMARY_PASSWORD = "testpass1234"
PRIMARY_USER_ID = "c6d4e174-250d-4ad9-9542-72649c5ce3b9"


# ---------------- helpers ----------------

def _password_login(email: str, password: str) -> dict:
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/token",
        params={"grant_type": "password"},
        headers={"apikey": SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"Supabase login failed: {r.status_code} {r.text}"
    return r.json()


def _admin_create_user(email: str, password: str) -> str:
    r = requests.post(
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        json={"email": email, "password": password, "email_confirm": True},
        timeout=15,
    )
    assert r.status_code in (200, 201), f"admin create failed: {r.status_code} {r.text}"
    return r.json()["id"]


# ---------------- fixtures ----------------

@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def primary_token() -> str:
    return _password_login(PRIMARY_EMAIL, PRIMARY_PASSWORD)["access_token"]


@pytest.fixture(scope="module")
def secondary_user():
    """Create a second confirmed user for the conflict scenario."""
    email = f"TEST_link_{int(time.time())}_{uuid.uuid4().hex[:6]}@cityquest.app"
    password = "pwd12345"
    uid = _admin_create_user(email, password)
    token = _password_login(email, password)["access_token"]
    return {"email": email, "password": password, "user_id": uid, "token": token}


# ---------------- /api/auth/me ----------------

class TestAuthMe:
    def test_me_no_token(self, s):
        r = s.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d == {"authenticated": False}

    def test_me_invalid_token_lenient(self, s):
        r = s.get(
            f"{API}/auth/me",
            headers={"Authorization": "Bearer not.a.valid.jwt"},
            timeout=10,
        )
        # get_optional_user is lenient → returns {authenticated: False}, not 401.
        assert r.status_code == 200, r.text
        assert r.json() == {"authenticated": False}

    def test_me_valid_token(self, s, primary_token):
        r = s.get(
            f"{API}/auth/me",
            headers={"Authorization": f"Bearer {primary_token}"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["authenticated"] is True
        assert d["user_id"] == PRIMARY_USER_ID
        assert d["email"] == PRIMARY_EMAIL
        assert d["role"] == "authenticated"


# ---------------- /api/auth/link-device ----------------

class TestLinkDevice:
    def test_link_no_token_returns_401(self, s):
        device = f"AUTO_TEST_link_noauth_{uuid.uuid4().hex[:8]}"
        r = s.post(f"{API}/auth/link-device", json={"device_id": device}, timeout=10)
        assert r.status_code == 401, r.text

    def test_link_brand_new_device_creates(self, s, primary_token):
        device = f"AUTO_TEST_link_new_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        r = s.post(
            f"{API}/auth/link-device",
            headers={"Authorization": f"Bearer {primary_token}"},
            json={"device_id": device},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "created"
        assert d["device_id"] == device
        assert d["user_id"] == PRIMARY_USER_ID

        # Verify a progress row exists with user_id set
        g = s.get(f"{API}/progress/{device}", timeout=10)
        assert g.status_code == 200
        body = g.json()
        assert body.get("user_id") == PRIMARY_USER_ID

    def test_link_existing_device_without_user_id_links(self, s, primary_token):
        # Step 1: create a progress row WITHOUT user_id via profile upsert.
        device = f"AUTO_TEST_link_existing_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        prof = s.post(
            f"{API}/progress/{device}/profile",
            json={"display_name": "Pre-link Traveler"},
            timeout=10,
        )
        assert prof.status_code == 200, prof.text
        # Sanity: no user_id yet
        g0 = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g0.get("user_id") in (None, ""), f"unexpected pre-link user_id: {g0.get('user_id')}"

        # Step 2: link with primary user → 'linked'
        r = s.post(
            f"{API}/auth/link-device",
            headers={"Authorization": f"Bearer {primary_token}"},
            json={"device_id": device},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "linked"
        assert d["device_id"] == device
        assert d["user_id"] == PRIMARY_USER_ID

        # Verify persisted
        g = s.get(f"{API}/progress/{device}", timeout=10).json()
        assert g.get("user_id") == PRIMARY_USER_ID
        # Display name should be preserved (not overwritten by link).
        assert g.get("display_name") == "Pre-link Traveler"

    def test_link_idempotent_returns_already(self, s, primary_token):
        device = f"AUTO_TEST_link_idem_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        # First call → created
        r1 = s.post(
            f"{API}/auth/link-device",
            headers={"Authorization": f"Bearer {primary_token}"},
            json={"device_id": device},
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["status"] == "created"

        # Second call same device + same user → already
        r2 = s.post(
            f"{API}/auth/link-device",
            headers={"Authorization": f"Bearer {primary_token}"},
            json={"device_id": device},
            timeout=15,
        )
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2["status"] == "already"
        assert d2["user_id"] == PRIMARY_USER_ID

    def test_link_conflict_when_device_belongs_to_other_user(
        self, s, primary_token, secondary_user
    ):
        device = f"AUTO_TEST_link_conf_{int(time.time())}_{uuid.uuid4().hex[:6]}"
        # User A claims the device first
        r1 = s.post(
            f"{API}/auth/link-device",
            headers={"Authorization": f"Bearer {primary_token}"},
            json={"device_id": device},
            timeout=15,
        )
        assert r1.status_code == 200, r1.text
        assert r1.json()["status"] == "created"

        # User B tries to claim the same device → 409
        r2 = s.post(
            f"{API}/auth/link-device",
            headers={"Authorization": f"Bearer {secondary_user['token']}"},
            json={"device_id": device},
            timeout=15,
        )
        assert r2.status_code == 409, r2.text


# ---------------- Regression: existing endpoints still work ----------------

class TestRegressionExistingRoutes:
    def test_cities_list(self, s):
        r = s.get(f"{API}/cities", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 4
        ids = {c["id"] for c in data}
        assert {"gaziantep", "istanbul", "paris", "rome"}.issubset(ids)

    def test_gaziantep_pois(self, s):
        r = s.get(f"{API}/cities/gaziantep/pois", timeout=15)
        assert r.status_code == 200, r.text
        pois = r.json()
        assert isinstance(pois, list)
        assert len(pois) >= 100
        assert all(p["city_id"] == "gaziantep" for p in pois)

    def test_gaziantep_quests(self, s):
        r = s.get(f"{API}/cities/gaziantep/quests", timeout=15)
        assert r.status_code == 200, r.text
        q = r.json()
        assert isinstance(q, list)
        assert len(q) >= 1
        assert all(x["city_id"] == "gaziantep" for x in q)

    def test_leaderboard(self, s):
        r = s.get(f"{API}/leaderboard", timeout=15)
        assert r.status_code == 200, r.text
        lb = r.json()
        assert isinstance(lb, list)
        assert len(lb) <= 50
        xps = [u["xp"] for u in lb]
        assert xps == sorted(xps, reverse=True)
