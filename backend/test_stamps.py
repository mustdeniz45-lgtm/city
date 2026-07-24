"""Tests for the pure stamp-computation logic. Run with:

    cd /app/backend && python -m pytest -q test_stamps.py
"""
import pytest

from stamps import (
    PRIMARY_CATEGORIES,
    TIER_BONUS_XP,
    TIER_ORDER,
    compute_stamp_level,
    tier_rank,
    _quantity_needed,
)


def _poi(id_: str, category: str) -> dict:
    return {"id": id_, "category": category, "city_id": "c", "lat": 0, "lng": 0}


def _city(counts: dict[str, int]) -> list[dict]:
    """Build a list of POIs like {'museum': 5, 'landmark': 10, ...}."""
    pois = []
    seq = 0
    for cat, n in counts.items():
        for _ in range(n):
            seq += 1
            pois.append(_poi(f"p-{cat}-{seq}", cat))
    return pois


def _visit(city_pois, per_cat: dict[str, int]) -> list[str]:
    """Return `n` check-in ids for each category from the city list."""
    out: list[str] = []
    for cat, n in per_cat.items():
        matching = [p["id"] for p in city_pois if p["category"] == cat]
        out.extend(matching[:n])
    return out


# ---------------- quantity formula (cap + Bronze floor) ----------------


def test_bronze_floor_never_below_8():
    # A 20-poi city → 10% = 2, floor to 8
    assert _quantity_needed(20, "bronze") == 8


def test_bronze_cap_at_12():
    # 400 pois → 10% = 40, capped to 12
    assert _quantity_needed(400, "bronze") == 12


def test_silver_scales_and_caps():
    assert _quantity_needed(80, "silver") == 20     # 25% = 20 (below cap)
    assert _quantity_needed(400, "silver") == 25    # 25% = 100, capped


def test_gold_and_diamond_caps():
    assert _quantity_needed(400, "gold") == 45
    assert _quantity_needed(400, "diamond") == 100


# ---------------- earned tiers ----------------


def test_no_tier_when_zero_checkins():
    city = _city({"landmark": 40, "museum": 20, "historic": 20, "must-see": 20, "restaurant": 30})
    r = compute_stamp_level(city, [])
    assert r["tier"] is None
    assert r["check_ins"] == 0
    assert r["next_tier"] == "bronze"


def test_bronze_needs_two_categories():
    # 131 poi city (Gaziantep-shape). Bronze qty = max(min(13, 12), 8) = 12.
    city = _city({"landmark": 30, "museum": 30, "historic": 30, "must-see": 20, "restaurant": 21})
    # 12 check-ins BUT all in one category → no Bronze
    visits = _visit(city, {"landmark": 12})
    assert compute_stamp_level(city, visits)["tier"] is None
    # Same 12 but mixed → Bronze
    visits = _visit(city, {"landmark": 6, "museum": 6})
    assert compute_stamp_level(city, visits)["tier"] == "bronze"


def test_silver_requires_museum_landmark_restaurant():
    city = _city({"landmark": 30, "museum": 30, "historic": 30, "must-see": 20, "restaurant": 21})
    # 25 check-ins across 3 primary categories BUT no restaurant → still Bronze
    visits = _visit(city, {"landmark": 9, "museum": 8, "historic": 8})
    r = compute_stamp_level(city, visits)
    assert r["tier"] == "bronze"
    assert r["next_tier"] == "silver"
    assert "restaurant" in r["next_tier_needed"]["categories_missing"]
    # Add a restaurant check-in → Silver becomes eligible only if we hit 25.
    visits = _visit(city, {"landmark": 9, "museum": 8, "historic": 7, "restaurant": 1})
    # 25 check-ins + 4 categories (incl. required) → Silver
    assert compute_stamp_level(city, visits)["tier"] == "silver"


def test_gold_requires_four_categories():
    city = _city({"landmark": 60, "museum": 60, "historic": 20, "must-see": 20, "restaurant": 21})
    # 50 check-ins across 3 categories → Silver only
    visits = _visit(city, {"landmark": 20, "museum": 20, "restaurant": 10})
    assert compute_stamp_level(city, visits)["tier"] == "silver"
    # Same qty but 4 categories → Gold
    visits = _visit(city, {"landmark": 15, "museum": 15, "restaurant": 10, "historic": 10})
    assert compute_stamp_level(city, visits)["tier"] == "gold"


def test_diamond_requires_all_five_categories():
    # Gaziantep-shape city (~131 pois). Diamond qty = 90% * 131 = 117 → capped to 100.
    city = _city({"landmark": 40, "museum": 30, "historic": 30, "must-see": 12, "restaurant": 21})
    visits = _visit(city, {"landmark": 40, "museum": 30, "historic": 20, "restaurant": 15})
    # 105 check-ins BUT 4 categories → Gold not Diamond
    assert compute_stamp_level(city, visits)["tier"] == "gold"
    visits = _visit(city, {"landmark": 40, "museum": 30, "historic": 15, "must-see": 5, "restaurant": 15})
    # 105 + all 5 categories → Diamond
    assert compute_stamp_level(city, visits)["tier"] == "diamond"


def test_service_pois_do_not_inflate_diversity():
    # 8 landmarks + 20 parkings; user visits ALL landmarks + 4 parkings = 12.
    # Diversity requirement for Bronze is 2 categories BUT parkings are
    # non-primary — they shouldn't count.
    city = _city({"landmark": 8, "museum": 0, "parking": 20})
    visits = [p["id"] for p in city]
    r = compute_stamp_level(city, visits[:12])
    assert r["tier"] is None   # only 1 primary category present → fails Bronze diversity


def test_stale_checkins_are_ignored():
    city = _city({"landmark": 20, "museum": 20, "historic": 20})
    visits = _visit(city, {"landmark": 6, "museum": 6}) + ["poi-does-not-exist", ""]
    r = compute_stamp_level(city, visits)
    assert r["check_ins"] == 12
    assert r["tier"] == "bronze"


def test_bonus_and_rank_helpers():
    for i, t in enumerate(TIER_ORDER):
        assert tier_rank(t) == i + 1
    assert tier_rank(None) == 0
    assert tier_rank("unknown") == 0
    assert set(TIER_BONUS_XP) == set(TIER_ORDER)
    assert TIER_BONUS_XP["bronze"] < TIER_BONUS_XP["diamond"]


def test_next_tier_missing_only_for_diamond_owners():
    city = _city({"landmark": 40, "museum": 30, "historic": 15, "must-see": 5, "restaurant": 15})
    visits = _visit(city, {"landmark": 40, "museum": 30, "historic": 15, "must-see": 5, "restaurant": 15})
    r = compute_stamp_level(city, visits)
    assert r["tier"] == "diamond"
    assert r["next_tier"] is None
    assert r["next_tier_needed"] is None
