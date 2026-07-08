"""Regression sweep after expo supervisor tunnel-flag fix.

Verifies backend API health via the public preview URL (EXPO_PUBLIC_BACKEND_URL /
EXPO_BACKEND_URL) since the internal ingress rewrites `/api/*` to backend:8001.
"""
import os
import uuid
import requests
import pytest

BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or "http://localhost:8001"
).rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- health & config ---------------------------------------------------------

def test_supabase_health(api):
    r = api.get(f"{BASE_URL}/api/supabase/health", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("configured") is True, body


# --- gaziantep city payloads -------------------------------------------------

def test_city_gaziantep(api):
    r = api.get(f"{BASE_URL}/api/cities/gaziantep", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # basic shape sanity
    assert isinstance(data, dict)
    assert data.get("slug") == "gaziantep" or data.get("id") == "gaziantep" or "name" in data


def test_gaziantep_pois_count(api):
    r = api.get(f"{BASE_URL}/api/cities/gaziantep/pois", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    pois = data if isinstance(data, list) else data.get("pois") or data.get("items") or []
    assert len(pois) >= 100, f"expected ~118 pois, got {len(pois)}"


def test_gaziantep_kultur_yolu_exact_53(api):
    r = api.get(f"{BASE_URL}/api/cities/gaziantep/kultur-yolu", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data if isinstance(data, list) else data.get("places") or data.get("items") or data.get("pois") or []
    assert len(items) == 53, f"expected exactly 53 kultur-yolu places, got {len(items)}"


def test_gaziantep_cvs_summary(api):
    r = api.get(f"{BASE_URL}/api/cities/gaziantep/cvs-summary", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    # Should have ~118 keys (one per POI)
    if isinstance(data, dict):
        # payload might be {"summary": {...}} or flat
        summary = data.get("summary") if "summary" in data else data
        assert isinstance(summary, dict)
        assert len(summary) >= 100, f"expected ~118 cvs entries, got {len(summary)}"


# --- leaderboard -------------------------------------------------------------

def test_leaderboard(api):
    r = api.get(f"{BASE_URL}/api/leaderboard", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, (list, dict))


# --- progress check-in (POI) -------------------------------------------------

def test_poi_check_in_panorama_museum(api):
    payload = {
        "device_id": f"TEST_regression_{uuid.uuid4().hex[:10]}",
        "poi_id": "poi-gaz-001-panorama-museum-25-december",
        "lat": 37.06627,
        "lng": 37.37995,
        "city_slug": "gaziantep",
    }
    r = api.post(f"{BASE_URL}/api/progress/poi-check-in", json=payload, timeout=20)
    # Accept 200 or 201 as success
    assert r.status_code in (200, 201), f"{r.status_code} :: {r.text}"
