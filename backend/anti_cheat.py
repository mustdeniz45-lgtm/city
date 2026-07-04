"""Anti-cheat guards for GPS check-ins.

Since the client is the one supplying `lat`/`lng`, the Haversine radius
check alone can't stop a determined attacker: they just POST the POI's
coordinates. This module adds four defensive layers that must all pass
for a check-in to be accepted:

  1. **IP + device rate limiting** — sliding window (per minute) on
     `POST /progress/*-check-in`. Blocks scripts hammering the endpoint.
  2. **Per-POI cooldown** — the same (device, POI) pair cannot check in
     twice within `POI_COOLDOWN_S` (default 5 minutes). Stops rapid
     replay attacks.
  3. **Superhuman speed** — if the user's last check-in was
     ``<= SPEED_WINDOW_S`` ago and implies a travel speed above
     ``MAX_SPEED_KMH`` (default 200 km/h), reject as teleport.
  4. **Log cap** — the persisted `check_ins` list is trimmed to the last
     ``MAX_CHECKINS`` entries (default 500) so the row can't grow
     unbounded and DoS the DB.

Storage is intentionally **in-process** (`collections.deque` +
`dict`). It's not shared across worker replicas, which is fine for the
current single-instance FastAPI deployment; if we ever scale
horizontally, swap `_ip_hits` / `_device_hits` for Redis. The tests
still work either way because they run in-process.
"""
from __future__ import annotations

import math
import time
from collections import deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional, Tuple

from fastapi import Request

# ---- Tunables ---------------------------------------------------------------

RATE_LIMIT_WINDOW_S = 60            # rolling window duration
RATE_LIMIT_MAX_REQ  = 20            # max check-in POSTs per window (per key)
POI_COOLDOWN_S      = 5 * 60        # cooldown for same (device, poi)
SPEED_WINDOW_S      = 60 * 60       # only compare check-ins <=1h apart
MAX_SPEED_KMH       = 200.0         # implied speed cap between check-ins
MAX_CHECKINS        = 500           # bound persisted check_ins array

# ---- In-memory state (per-process) -----------------------------------------

# Sliding-window timestamps per identity key.
_ip_hits:     Dict[str, Deque[float]] = {}
_device_hits: Dict[str, Deque[float]] = {}


@dataclass
class CheatResult:
    """Return value from :func:`check_pre_gate` — encodes a fast-fail."""
    ok: bool
    reason: Optional[str] = None
    retry_after_s: Optional[int] = None


# ---- Public API -------------------------------------------------------------

def client_ip(request: Optional[Request]) -> str:
    """Best-effort client IP (falls back to the socket peer)."""
    if not request:
        return "unknown"
    # Trust the first non-empty proxy header if present; only used as an
    # identity key for rate limiting, not for auth.
    for hdr in ("x-forwarded-for", "x-real-ip", "cf-connecting-ip"):
        v = request.headers.get(hdr)
        if v:
            return v.split(",")[0].strip()
    return getattr(request.client, "host", "unknown") if request.client else "unknown"


def _sliding_hit(bucket: Dict[str, Deque[float]], key: str, now: float) -> int:
    """Record `now` for `key`, evict old entries, return current count."""
    dq = bucket.get(key)
    if dq is None:
        dq = deque()
        bucket[key] = dq
    cutoff = now - RATE_LIMIT_WINDOW_S
    while dq and dq[0] < cutoff:
        dq.popleft()
    dq.append(now)
    return len(dq)


def check_pre_gate(
    device_id: str,
    request: Optional[Request],
    *,
    last_check_ins: List[Dict[str, Any]],
    poi_id: str,
    lat: Optional[float],
    lng: Optional[float],
) -> CheatResult:
    """Run rate-limit, cooldown, and speed checks BEFORE any DB write.

    Returns ``CheatResult(ok=True)`` when the check-in should proceed, or
    ``ok=False`` with a human-readable reason and a retry hint the client
    can display.
    """
    now = time.time()

    # 1) Rate limiting (per device + per IP; either one tripping blocks).
    ip = client_ip(request)
    if _sliding_hit(_device_hits, device_id, now) > RATE_LIMIT_MAX_REQ:
        return CheatResult(False, "Too many check-in attempts. Slow down and try again in a minute.", 60)
    if ip != "unknown" and _sliding_hit(_ip_hits, ip, now) > RATE_LIMIT_MAX_REQ:
        return CheatResult(False, "Too many check-in attempts from this network.", 60)

    # 2) Per-POI cooldown (same device + same POI within POI_COOLDOWN_S).
    last_for_this_poi = _latest_ts_for_poi(last_check_ins, poi_id)
    if last_for_this_poi is not None:
        elapsed = now - last_for_this_poi
        if elapsed < POI_COOLDOWN_S:
            remaining = int(POI_COOLDOWN_S - elapsed)
            m, s = divmod(remaining, 60)
            pretty = f"{m}m {s}s" if m else f"{s}s"
            return CheatResult(
                False,
                f"You just checked in here — try again in {pretty}.",
                remaining,
            )

    # 3) Superhuman speed vs. the last check-in that had coords.
    if lat is not None and lng is not None:
        last_geo = _last_geo(last_check_ins)
        if last_geo:
            prev_ts, prev_lat, prev_lng = last_geo
            dt = now - prev_ts
            if 0 < dt <= SPEED_WINDOW_S:
                dist_km = _haversine_km(prev_lat, prev_lng, lat, lng)
                speed_kmh = dist_km / (dt / 3600.0)
                if speed_kmh > MAX_SPEED_KMH:
                    return CheatResult(
                        False,
                        (f"Impossible travel detected: {dist_km:.1f} km in "
                         f"{int(dt)}s ≈ {int(speed_kmh)} km/h. Check-in blocked."),
                        None,
                    )

    return CheatResult(True)


def bound_check_ins(check_ins: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Trim the persisted list to the most recent ``MAX_CHECKINS`` entries."""
    if len(check_ins) <= MAX_CHECKINS:
        return check_ins
    return check_ins[-MAX_CHECKINS:]


# ---- Helpers ---------------------------------------------------------------

def _parse_iso(ts: str) -> Optional[float]:
    try:
        # Fast path: ISO-8601 with tz suffix is what our writers emit.
        from datetime import datetime
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except Exception:
        return None


def _latest_ts_for_poi(check_ins: List[Dict[str, Any]], poi_id: str) -> Optional[float]:
    best: Optional[float] = None
    for ci in check_ins:
        if ci.get("poi_id") != poi_id:
            continue
        ts = _parse_iso(ci.get("at") or "")
        if ts is None:
            continue
        if best is None or ts > best:
            best = ts
    return best


def _last_geo(check_ins: List[Dict[str, Any]]) -> Optional[Tuple[float, float, float]]:
    """Return (unix_ts, lat, lng) of the most recent check-in that had coords."""
    latest: Optional[Tuple[float, float, float]] = None
    for ci in check_ins:
        lat, lng = ci.get("lat"), ci.get("lng")
        if lat is None or lng is None:
            continue
        ts = _parse_iso(ci.get("at") or "")
        if ts is None:
            continue
        if latest is None or ts > latest[0]:
            latest = (ts, float(lat), float(lng))
    return latest


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(1 - a))
