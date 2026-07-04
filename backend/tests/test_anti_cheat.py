"""
Anti-cheat GPS guards — backend regression tests.

Covers the new /app/backend/anti_cheat.py module and its wiring into
POST /api/progress/poi-check-in and POST /api/progress/check-in.

Layers under test:
  1. Rate limiting (20 req / 60s per device AND per IP)
  2. Per-POI cooldown (5 min for same device+POI)
  3. Superhuman-speed detection (>200 km/h between successive check-ins)
  4. Log cap: bound_check_ins() trims list to MAX_CHECKINS (500)
  5. Distance guard (unchanged: too_far → 200 with success=False, NOT 429)
  6. Non-regression sweep on read endpoints + review gate.
"""
import os
import sys
import time
import uuid
import pytest
import requests

# Make backend module importable for the direct unit test on bound_check_ins.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")

PANORAMA_POI = "poi-gaz-001-panorama-museum-25-december"
PANORAMA_COORDS = (37.06627, 37.37995)

ZEUGMA_POI = "poi-gaz-054-zeugma-mosaic-museum"
# fetched from GET /api/pois/... at test collection time

CASTLE_POI = "poi-gaz-009-gaziantep-castle"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _fresh_device(prefix="anticheat"):
    return f"TEST_{prefix}_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"


def _poi_checkin(api, device_id, poi_id, lat, lng, xff=None):
    headers = {}
    if xff:
        headers["X-Forwarded-For"] = xff
    return api.post(
        f"{BASE_URL}/api/progress/poi-check-in",
        json={
            "device_id": device_id,
            "poi_id": poi_id,
            "lat": lat,
            "lng": lng,
            "display_name": "TEST_ac",
        },
        headers=headers or None,
    )


# ─────────────────────────────────────────────────────────────
# 1. Rate limiting
# ─────────────────────────────────────────────────────────────
class TestRateLimit:
    def test_rate_limit_kicks_in_after_20(self, api):
        # Use a unique X-Forwarded-For so we can't be starved by other tests
        # sharing the IP bucket, then hammer 25 requests from a single device.
        device = _fresh_device("rl")
        xff = f"10.0.0.{uuid.uuid4().int % 250 + 1}"
        statuses = []
        details = []
        for i in range(25):
            r = _poi_checkin(api, device, PANORAMA_POI, *PANORAMA_COORDS, xff=xff)
            statuses.append(r.status_code)
            if r.status_code == 429:
                details.append(r.json().get("detail", ""))
            else:
                details.append("")

        # First hit should succeed (200, success=true).
        assert statuses[0] == 200, f"1st call expected 200, got {statuses[0]} — {details[0]}"
        # Hits 2..20 should already be blocked by the per-POI cooldown (429).
        for i in range(1, 20):
            assert statuses[i] == 429, f"call #{i+1}: expected 429 from cooldown, got {statuses[i]}"
            assert "already checked in" in details[i].lower() or "try again" in details[i].lower(), \
                f"call #{i+1}: expected cooldown message, got '{details[i]}'"
        # Hits 21..25 should switch to the rate-limit reason.
        for i in range(20, 25):
            assert statuses[i] == 429, f"call #{i+1}: expected 429 from rate limit, got {statuses[i]}"
            assert "too many check-in attempts" in details[i].lower(), \
                f"call #{i+1}: expected rate-limit detail, got '{details[i]}'"

    def test_different_device_unaffected_from_different_ip(self, api):
        # A fresh device with its OWN simulated IP should be able to check in
        # even if another device just exhausted its device+IP window.
        device_a = _fresh_device("rl_a")
        xff_a = f"10.0.1.{uuid.uuid4().int % 250 + 1}"
        for _ in range(22):
            _poi_checkin(api, device_a, PANORAMA_POI, *PANORAMA_COORDS, xff=xff_a)

        device_b = _fresh_device("rl_b")
        xff_b = f"10.0.2.{uuid.uuid4().int % 250 + 1}"
        r = _poi_checkin(api, device_b, PANORAMA_POI, *PANORAMA_COORDS, xff=xff_b)
        assert r.status_code == 200, f"different device+IP should succeed, got {r.status_code} — {r.text[:200]}"
        body = r.json()
        assert body.get("success") is True


# ─────────────────────────────────────────────────────────────
# 2. Per-POI cooldown
# ─────────────────────────────────────────────────────────────
class TestPerPoiCooldown:
    def test_first_ok_second_blocked_with_time_remaining(self, api):
        device = _fresh_device("cd")
        xff = f"10.0.3.{uuid.uuid4().int % 250 + 1}"

        r1 = _poi_checkin(api, device, PANORAMA_POI, *PANORAMA_COORDS, xff=xff)
        assert r1.status_code == 200, r1.text
        assert r1.json().get("success") is True

        r2 = _poi_checkin(api, device, PANORAMA_POI, *PANORAMA_COORDS, xff=xff)
        assert r2.status_code == 429, r2.text
        detail = r2.json().get("detail", "").lower()
        assert "checked in" in detail or "try again" in detail, f"unexpected detail: {detail}"
        # Cooldown message must include a minute/second countdown (e.g. "4m 59s" or "59s")
        assert ("m " in detail and "s" in detail) or detail.rstrip(".").endswith("s"), \
            f"expected countdown formatting in detail: {detail}"


# ─────────────────────────────────────────────────────────────
# 3. Superhuman speed
# ─────────────────────────────────────────────────────────────
class TestSuperhumanSpeed:
    def test_teleport_between_pois_blocked(self, api):
        device = _fresh_device("speed")
        xff = f"10.0.4.{uuid.uuid4().int % 250 + 1}"

        # First check-in at Panorama Museum
        r1 = _poi_checkin(api, device, PANORAMA_POI, *PANORAMA_COORDS, xff=xff)
        assert r1.status_code == 200, r1.text

        # Fetch Zeugma coords dynamically to avoid hardcoding
        zeugma = api.get(f"{BASE_URL}/api/pois/{ZEUGMA_POI}").json()
        assert "lat" in zeugma and "lng" in zeugma

        # Immediately check in ~1km away → speed >> 200 km/h
        r2 = _poi_checkin(api, device, ZEUGMA_POI, zeugma["lat"], zeugma["lng"], xff=xff)
        assert r2.status_code == 429, r2.text
        detail = r2.json().get("detail", "").lower()
        assert "impossible travel" in detail, f"expected 'Impossible travel' in detail, got: {detail}"
        assert "km/h" in detail


# ─────────────────────────────────────────────────────────────
# 4. Distance guard unchanged: too_far → 200 (NOT 429)
# ─────────────────────────────────────────────────────────────
class TestDistanceGuardUnchanged:
    def test_too_far_returns_200_success_false(self, api):
        device = _fresh_device("far")
        xff = f"10.0.5.{uuid.uuid4().int % 250 + 1}"
        # ~5km SW of Panorama Museum
        far_lat, far_lng = 37.02, 37.34
        r = _poi_checkin(api, device, PANORAMA_POI, far_lat, far_lng, xff=xff)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("success") is False
        assert body.get("too_far") is True
        assert body.get("distance_m", 0) > 1000


# ─────────────────────────────────────────────────────────────
# 5. bound_check_ins() unit test — direct import
# ─────────────────────────────────────────────────────────────
class TestBoundCheckIns:
    def test_trim_to_500_keeps_last_500(self):
        import anti_cheat
        assert anti_cheat.MAX_CHECKINS == 500
        # Feed 600 dummy entries, tagged with their index
        items = [{"poi_id": f"p{i}", "at": f"2026-01-01T00:00:{i:02d}Z"} for i in range(600)]
        out = anti_cheat.bound_check_ins(items)
        assert len(out) == 500
        # Must keep the LAST 500 (i.e. items[100:])
        assert out[0]["poi_id"] == "p100"
        assert out[-1]["poi_id"] == "p599"

    def test_under_cap_unchanged(self):
        import anti_cheat
        items = [{"poi_id": f"p{i}", "at": ""} for i in range(10)]
        out = anti_cheat.bound_check_ins(items)
        assert out == items
        assert len(out) == 10

    def test_constants_match_spec(self):
        import anti_cheat
        assert anti_cheat.RATE_LIMIT_WINDOW_S == 60
        assert anti_cheat.RATE_LIMIT_MAX_REQ == 20
        assert anti_cheat.POI_COOLDOWN_S == 300
        assert anti_cheat.SPEED_WINDOW_S == 3600
        assert anti_cheat.MAX_SPEED_KMH == 200.0
        assert anti_cheat.MAX_CHECKINS == 500


# ─────────────────────────────────────────────────────────────
# 6. Regression sweep — must still work
# ─────────────────────────────────────────────────────────────
class TestRegression:
    def test_city_gaziantep(self, api):
        r = api.get(f"{BASE_URL}/api/cities/gaziantep")
        assert r.status_code == 200
        d = r.json()
        assert d["poi_count"] == 118
        assert d["quest_count"] >= 10

    def test_kultur_yolu_53(self, api):
        r = api.get(f"{BASE_URL}/api/cities/gaziantep/kultur-yolu")
        assert r.status_code == 200
        d = r.json()
        # payload may be a list or an object containing entries
        entries = d if isinstance(d, list) else (d.get("entries") or d.get("items") or [])
        assert len(entries) == 53, f"expected 53 kultur-yolu entries, got {len(entries)}"

    def test_cvs_summary_118(self, api):
        r = api.get(f"{BASE_URL}/api/cities/gaziantep/cvs-summary")
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d, dict)
        assert len(d) == 118, f"expected 118 keys in cvs-summary, got {len(d)}"

    def test_progress_get(self, api):
        r = api.get(f"{BASE_URL}/api/progress/TEST_ac_regression_probe")
        assert r.status_code == 200

    def test_cvs_panorama_and_castle(self, api):
        for pid in (PANORAMA_POI, CASTLE_POI):
            r = api.get(f"{BASE_URL}/api/pois/{pid}/cvs")
            assert r.status_code == 200, f"{pid} /cvs -> {r.status_code}"

    def test_reviews_list(self, api):
        r = api.get(f"{BASE_URL}/api/pois/{PANORAMA_POI}/reviews")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_review_post_still_enforces_short_comment_and_gate(self, api):
        # Fresh device with no check-in → 403 (verified check-in gate) OR 400 (short comment)
        fresh = _fresh_device("rev_gate")
        r = api.post(f"{BASE_URL}/api/pois/{PANORAMA_POI}/reviews", json={
            "device_id": fresh,
            "overall": 5,
            "dimensions": {"exhibition": 5, "information": 4, "authenticity": 5, "accessibility": 4},
            "comment": "This is a long enough comment for validator!",
        })
        # No check-in → must be blocked (403 by the verified gate)
        assert r.status_code == 403, f"expected 403 (no check-in), got {r.status_code}: {r.text[:200]}"

        # Now short comment on a device WITH a check-in → 400
        device = _fresh_device("rev_short")
        xff = f"10.0.6.{uuid.uuid4().int % 250 + 1}"
        r_ci = _poi_checkin(api, device, PANORAMA_POI, *PANORAMA_COORDS, xff=xff)
        assert r_ci.status_code == 200
        r2 = api.post(f"{BASE_URL}/api/pois/{PANORAMA_POI}/reviews", json={
            "device_id": device,
            "overall": 5,
            "dimensions": {"exhibition": 5, "information": 4, "authenticity": 5, "accessibility": 4},
            "comment": "too short",
        })
        assert r2.status_code == 400
        assert "20" in r2.text  # min-20-char message
