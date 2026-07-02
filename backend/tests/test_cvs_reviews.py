"""
CVS (CityQuest Verified Score) Phase 1 — backend regression tests.

Coverage:
  1. Review POST validation (comment length, dims per category, verified check-in gate)
  2. GET /cvs reflects new review ratings
  3. GET /reviews returns author profile populated
  4. Eligibility endpoint before/after check-in
  5. Non-regression on earlier flows (cities, pois, progress, quests, leaderboard)
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://localhost:8001").rstrip("/")

RESTAURANT_POI = "poi-gaz-rest-006-kebap-halil-usta"
LANDMARK_POI = "poi-gaz-009-gaziantep-castle"

# Coords for check-in seed
RESTAURANT_COORDS = (37.0774, 37.3854)
LANDMARK_COORDS = (37.066312, 37.383187)


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def device_id():
    # Fresh, isolated device per test run so we don't pollute existing users
    return f"TEST_cvs_{uuid.uuid4().hex[:8]}"


def _check_in(api, device_id, poi_id, lat, lng):
    r = api.post(f"{BASE_URL}/api/progress/poi-check-in", json={
        "device_id": device_id,
        "poi_id": poi_id,
        "lat": lat,
        "lng": lng,
        "display_name": "TEST_CVS_Wolfy",
    })
    return r


# ─────────────────────────────────────────────────────────────
# 1. Non-regression: core read endpoints
# ─────────────────────────────────────────────────────────────
class TestNonRegression:
    def test_get_city(self, api):
        r = api.get(f"{BASE_URL}/api/cities/gaziantep")
        assert r.status_code == 200
        assert r.json().get("id") == "gaziantep"

    def test_get_city_pois(self, api):
        r = api.get(f"{BASE_URL}/api/cities/gaziantep/pois")
        assert r.status_code == 200
        pois = r.json()
        assert isinstance(pois, list) and len(pois) > 50

    def test_leaderboard(self, api):
        r = api.get(f"{BASE_URL}/api/leaderboard")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_quest_progress(self, api):
        r = api.get(f"{BASE_URL}/api/quests/q-gaz-111/progress?device_id=demo")
        assert r.status_code == 200
        data = r.json()
        assert "groups" in data or "current" in data or isinstance(data, dict)

    def test_progress_get(self, api, device_id):
        r = api.get(f"{BASE_URL}/api/progress/{device_id}")
        assert r.status_code == 200


# ─────────────────────────────────────────────────────────────
# 2. Eligibility endpoint
# ─────────────────────────────────────────────────────────────
class TestEligibility:
    def test_not_eligible_without_checkin(self, api, device_id):
        r = api.get(f"{BASE_URL}/api/pois/{LANDMARK_POI}/reviews/eligibility",
                    params={"device_id": device_id})
        assert r.status_code == 200
        data = r.json()
        assert data["eligible"] is False
        assert data["window_hours"] == 24
        assert data["reason"]

    def test_poi_not_found(self, api, device_id):
        r = api.get(f"{BASE_URL}/api/pois/nonexistent-poi/reviews/eligibility",
                    params={"device_id": device_id})
        assert r.status_code == 404

    def test_eligible_after_checkin(self, api, device_id):
        ci = _check_in(api, device_id, LANDMARK_POI, *LANDMARK_COORDS)
        assert ci.status_code == 200, ci.text
        r = api.get(f"{BASE_URL}/api/pois/{LANDMARK_POI}/reviews/eligibility",
                    params={"device_id": device_id})
        assert r.status_code == 200
        data = r.json()
        assert data["eligible"] is True, f"Expected eligible=True after check-in; got {data}"


# ─────────────────────────────────────────────────────────────
# 3. Review submission — landmark (culture dims)
# ─────────────────────────────────────────────────────────────
class TestLandmarkReview:
    def test_reject_short_comment(self, api, device_id):
        # Ensure check-in exists (idempotent)
        _check_in(api, device_id, LANDMARK_POI, *LANDMARK_COORDS)
        r = api.post(f"{BASE_URL}/api/pois/{LANDMARK_POI}/reviews", json={
            "device_id": device_id,
            "overall": 5,
            "dimensions": {"exhibition": 5, "information": 4, "authenticity": 5, "accessibility": 4},
            "comment": "too short",
        })
        assert r.status_code == 400
        assert "20" in r.text  # message mentions min 20 chars

    def test_reject_no_checkin(self, api):
        fresh = f"TEST_nocheckin_{uuid.uuid4().hex[:6]}"
        r = api.post(f"{BASE_URL}/api/pois/{LANDMARK_POI}/reviews", json={
            "device_id": fresh,
            "overall": 5,
            "dimensions": {"exhibition": 5, "information": 4, "authenticity": 5, "accessibility": 4},
            "comment": "This is a long enough comment for the review validator!",
        })
        assert r.status_code == 403

    def test_accept_valid_landmark_review(self, api, device_id):
        _check_in(api, device_id, LANDMARK_POI, *LANDMARK_COORDS)
        payload = {
            "device_id": device_id,
            "overall": 5,
            "dimensions": {
                "exhibition": 5, "information": 4,
                "authenticity": 5, "accessibility": 4,
            },
            "comment": "Truly amazing castle with stunning views over the whole city.",
        }
        r = api.post(f"{BASE_URL}/api/pois/{LANDMARK_POI}/reviews", json=payload)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        rev = body["review"]
        assert rev["verified"] is True
        assert rev["overall"] == 5
        assert rev["dimensions"]["exhibition"] == 5


# ─────────────────────────────────────────────────────────────
# 4. Review submission — restaurant (food dims)
# ─────────────────────────────────────────────────────────────
class TestRestaurantReview:
    def test_reject_wrong_dims(self, api, device_id):
        _check_in(api, device_id, RESTAURANT_POI, *RESTAURANT_COORDS)
        # Passing culture dims to a restaurant should be rejected — missing `food`
        r = api.post(f"{BASE_URL}/api/pois/{RESTAURANT_POI}/reviews", json={
            "device_id": device_id,
            "overall": 4,
            "dimensions": {"exhibition": 5, "information": 4, "authenticity": 5, "accessibility": 4},
            "comment": "This is a long enough comment to pass the validator.",
        })
        assert r.status_code == 400
        assert "food" in r.text.lower()

    def test_reject_short_comment_restaurant(self, api, device_id):
        _check_in(api, device_id, RESTAURANT_POI, *RESTAURANT_COORDS)
        r = api.post(f"{BASE_URL}/api/pois/{RESTAURANT_POI}/reviews", json={
            "device_id": device_id,
            "overall": 5,
            "dimensions": {"food": 5, "service": 5, "value": 4, "authenticity": 5},
            "comment": "short",
        })
        assert r.status_code == 400

    def test_accept_valid_restaurant_review(self, api, device_id):
        _check_in(api, device_id, RESTAURANT_POI, *RESTAURANT_COORDS)
        r = api.post(f"{BASE_URL}/api/pois/{RESTAURANT_POI}/reviews", json={
            "device_id": device_id,
            "overall": 5,
            "dimensions": {"food": 5, "service": 4, "value": 5, "authenticity": 5},
            "comment": "Best lahmacun and kebap in the region — highly recommended!",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["review"]["verified"] is True
        assert body["review"]["dimensions"]["food"] == 5


# ─────────────────────────────────────────────────────────────
# 5. GET /reviews reflects new row + author populated
# ─────────────────────────────────────────────────────────────
class TestReviewsListing:
    def test_landmark_reviews_include_author(self, api, device_id):
        r = api.get(f"{BASE_URL}/api/pois/{LANDMARK_POI}/reviews")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        mine = [x for x in rows if x.get("device_id") == device_id]
        assert len(mine) >= 1, f"Own review not in list; got {len(rows)} rows"
        row = mine[0]
        assert "author" in row
        # author should carry at least display_name (from progress)
        assert "display_name" in row["author"]


# ─────────────────────────────────────────────────────────────
# 6. CVS score reflects reviews (dim_avg, cq_score)
# ─────────────────────────────────────────────────────────────
class TestCVSAggregation:
    def test_landmark_cvs_reflects_review(self, api, device_id):
        r = api.get(f"{BASE_URL}/api/pois/{LANDMARK_POI}/cvs")
        assert r.status_code == 200
        d = r.json()
        assert d["review_count"] >= 1
        assert d["cq_score"] is not None
        assert d["cvs"] > 0
        assert set(["exhibition", "information", "authenticity", "accessibility"]).issubset(d["dimensions"].keys())
        # our review had overall=5 → cq_score should be >= 20*1 (i.e. at least 20 for 1 review)
        assert d["cq_score"] >= 20

    def test_restaurant_cvs_has_food_dims(self, api):
        r = api.get(f"{BASE_URL}/api/pois/{RESTAURANT_POI}/cvs")
        assert r.status_code == 200
        d = r.json()
        assert set(["food", "service", "value", "authenticity"]).issubset(d["dimensions"].keys())

    def test_cvs_zero_reviews_poi(self, api):
        # A random landmark that likely has no reviews — fallback path
        # Pick one from POI list
        pois = api.get(f"{BASE_URL}/api/cities/gaziantep/pois").json()
        target = next((p["id"] for p in pois if p["id"] not in (LANDMARK_POI, RESTAURANT_POI)), None)
        assert target
        r = api.get(f"{BASE_URL}/api/pois/{target}/cvs")
        assert r.status_code == 200
        d = r.json()
        # if there are no reviews, confidence should not be "high" and weights should reflect fallback
        if d["review_count"] == 0:
            assert d["confidence"] == "low"
            assert d["breakdown_weights"]["google"] == 1.0
