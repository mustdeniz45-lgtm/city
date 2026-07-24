"""Tiered passport-stamp computation for CityQuest.

Pure logic, no I/O. Two functions:

* `compute_stamp_level(city_pois, checked_in_ids)` — returns the highest
  tier the user has earned for that city plus a rich `progress` payload
  the UI can render (counts, next-tier requirement, missing categories,
  per-category tallies).

* `tier_bonus_xp(tier)` — the fixed XP grant for reaching a tier.

Testable in isolation: neither Supabase nor FastAPI are imported. Server
code layers on top of this.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

# Canonical "primary" categories used by the stamp system. Everything else
# in `metadata.raw_categories` (mosques, hans, hamams, nature sub-tags,
# parking, WCs, etc.) is IGNORED here — those are amenity subtypes, not
# stamp-eligible sight categories.
PRIMARY_CATEGORIES: Tuple[str, ...] = (
    "landmark", "museum", "historic", "must-see", "restaurant",
)

# Tier ordering — lowest to highest. `compute_stamp_level` walks this list
# top-down and returns the highest tier for which BOTH quantity and
# diversity conditions are satisfied.
TIER_ORDER: Tuple[str, ...] = ("bronze", "silver", "gold", "diamond")

# XP granted the first time a user reaches a tier for a city. On upgrade
# (e.g. Bronze → Silver) we award the NEW tier's bonus (not a diff sum) —
# it's cleaner for the celebration UX ("You earned Silver! +250 XP") and
# still cannot double-grant a tier already banked because we only fire
# when the new tier is strictly higher than the recorded one.
TIER_BONUS_XP: Dict[str, int] = {
    "bronze": 100,
    "silver": 250,
    "gold": 500,
    "diamond": 1500,
}


def tier_rank(tier: Optional[str]) -> int:
    """0 for 'no tier yet', 1..4 for bronze..diamond."""
    if not tier:
        return 0
    try:
        return TIER_ORDER.index(tier) + 1
    except ValueError:
        return 0


def tier_bonus_xp(tier: Optional[str]) -> int:
    return TIER_BONUS_XP.get(tier or "", 0)


def _quantity_needed(total_pois: int, tier: str) -> int:
    """Percentage-of-total formula with a hard cap so requirements scale
    fairly across small (Gaziantep ≈ 131) and huge (Istanbul ≈ 400) cities.

    Bronze has an extra `max(_, 8)` floor so tiny cities don't hand out
    Bronze after a single check-in.
    """
    tp = max(0, int(total_pois or 0))
    if tier == "bronze":
        return max(min(int(tp * 0.10), 12), 8)
    if tier == "silver":
        return min(int(tp * 0.25), 25)
    if tier == "gold":
        return min(int(tp * 0.50), 45)
    if tier == "diamond":
        return min(int(tp * 0.90), 100)
    raise ValueError(f"Unknown tier {tier!r}")


def _diversity_required(tier: str) -> Tuple[int, Set[str]]:
    """(min_distinct_categories, required_specific_categories) per tier."""
    if tier == "bronze":
        return (2, set())
    if tier == "silver":
        return (3, {"museum", "landmark", "restaurant"})
    if tier == "gold":
        return (4, set())
    if tier == "diamond":
        return (5, set(PRIMARY_CATEGORIES))
    raise ValueError(f"Unknown tier {tier!r}")


def _diversity_ok(distinct: Set[str], min_distinct: int, required: Set[str]) -> bool:
    if len(distinct) < min_distinct:
        return False
    if required and not required.issubset(distinct):
        return False
    return True


def _bucket_category(raw: Optional[str]) -> Optional[str]:
    """Fold a POI's stored `category` into one of the 5 PRIMARY buckets.
    Returns None for amenity / service subtypes so they don't inflate
    diversity counts."""
    if not raw:
        return None
    r = raw.lower()
    if r in PRIMARY_CATEGORIES:
        return r
    # No implicit remap — services (parking, wc, drinking_fountain) are
    # NOT stamp-eligible categories by design.
    return None


def compute_stamp_level(
    city_pois: List[Dict[str, Any]],
    checked_in_poi_ids: Iterable[str],
) -> Dict[str, Any]:
    """Return the user's earned tier for `city_pois` plus a `progress`
    payload that describes what's needed for the next tier.

    ARGUMENTS:
        city_pois — every POI in the city, each with at least `id` and
                    `category`. Extra keys are ignored.
        checked_in_poi_ids — the ids the user has actually checked into.

    RETURN SHAPE (stable, safe to expose over the API):
        {
          "tier": "silver" | ... | None,
          "check_ins": 12,
          "total_pois": 131,
          "categories": ["landmark", "museum", ...],         # distinct primary categories present in check-ins
          "per_category": {"landmark": 4, "museum": 2, ...}, # detailed counts (primary only)
          "next_tier": "gold" | None,
          "next_tier_needed": {
              "count": 45,
              "categories_min": 4,
              "categories_missing": ["historic"],            # required categories the user hasn't hit yet
          }
        }
    """
    id_set = {i for i in checked_in_poi_ids if i}
    total_pois = len(city_pois or [])

    # Bucket check-ins by category. Only POIs actually present in the city
    # count (silently ignores foreign / stale ids in the check-in log).
    poi_by_id = {p.get("id"): p for p in (city_pois or []) if p.get("id")}
    per_category: Dict[str, int] = {c: 0 for c in PRIMARY_CATEGORIES}
    count_valid = 0
    for pid in id_set:
        poi = poi_by_id.get(pid)
        if not poi:
            continue
        count_valid += 1
        bucket = _bucket_category(poi.get("category"))
        if bucket:
            per_category[bucket] = per_category.get(bucket, 0) + 1
    distinct = {c for c, n in per_category.items() if n > 0}

    # Walk tiers top-down; the first one that qualifies is the earned tier.
    earned: Optional[str] = None
    for t in reversed(TIER_ORDER):
        need_count = _quantity_needed(total_pois, t)
        min_distinct, required = _diversity_required(t)
        if count_valid >= need_count and _diversity_ok(distinct, min_distinct, required):
            earned = t
            break

    # Build the next-tier hint. If diamond is earned, no next.
    idx = TIER_ORDER.index(earned) if earned else -1
    next_tier = TIER_ORDER[idx + 1] if idx + 1 < len(TIER_ORDER) else None
    if next_tier:
        need_count = _quantity_needed(total_pois, next_tier)
        min_distinct, required = _diversity_required(next_tier)
        missing = sorted(required - distinct)
        needed_payload = {
            "count": need_count,
            "categories_min": min_distinct,
            "categories_missing": missing,
        }
    else:
        needed_payload = None

    return {
        "tier": earned,
        "check_ins": count_valid,
        "total_pois": total_pois,
        "categories": sorted(distinct),
        "per_category": per_category,
        "next_tier": next_tier,
        "next_tier_needed": needed_payload,
    }
