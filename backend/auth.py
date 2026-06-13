"""Supabase JWT verification for FastAPI.

Verifies access tokens issued by Supabase Auth using:
  1. The asymmetric JWKS endpoint (RS256/ES256) when available, OR
  2. The legacy shared HS256 secret stored as SUPABASE_JWT_SECRET in env.

Exports two FastAPI dependencies:
  - `get_current_user`     → 401 if no/invalid token; returns dict of claims.
  - `get_optional_user`    → returns claims if token present & valid, else None.

Typical claims:
  - sub:   Supabase user_id (uuid)
  - email: user email
  - aud:   "authenticated"
  - role:  "authenticated" or "anon"
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Any, Dict, Optional

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else None
JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET")  # legacy HS256 fallback
AUDIENCE = "authenticated"


@lru_cache(maxsize=1)
def _jwks() -> Dict[str, Any]:
    if not JWKS_URL:
        return {"keys": []}
    try:
        r = httpx.get(JWKS_URL, timeout=5.0)
        r.raise_for_status()
        return r.json()
    except Exception:
        return {"keys": []}


def _public_key_for(kid: str):
    """Pull the RSA/EC public key matching the kid from the cached JWKS."""
    for key in _jwks().get("keys", []):
        if key.get("kid") == kid:
            return jwt.algorithms.RSAAlgorithm.from_jwk(key) if key.get("kty") == "RSA" \
                else jwt.algorithms.ECAlgorithm.from_jwk(key)
    return None


def verify_token(token: str) -> Dict[str, Any]:
    """Decode + verify a Supabase access token. Raises HTTP 401 on any failure."""
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Malformed token")

    alg = header.get("alg")
    options = {"verify_aud": False}  # Supabase sets aud=authenticated; lenient default
    try:
        if alg in ("RS256", "ES256"):
            kid = header.get("kid")
            key = _public_key_for(kid) if kid else None
            if key is None:
                # JWKS miss: refresh cache once and retry.
                _jwks.cache_clear()
                key = _public_key_for(kid) if kid else None
            if key is None:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown signing key")
            return jwt.decode(token, key, algorithms=[alg], audience=AUDIENCE, options=options)
        # Legacy / single-secret projects (HS256).
        if alg == "HS256":
            if not JWT_SECRET:
                raise HTTPException(
                    status.HTTP_401_UNAUTHORIZED,
                    "Server is missing SUPABASE_JWT_SECRET for legacy HS256 verification",
                )
            return jwt.decode(token, JWT_SECRET, algorithms=["HS256"], audience=AUDIENCE, options=options)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Unsupported alg: {alg}")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired")
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")


def _extract_bearer(request: Request) -> Optional[str]:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth:
        return None
    parts = auth.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def get_current_user(request: Request) -> Dict[str, Any]:
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    return verify_token(token)


async def get_optional_user(request: Request) -> Optional[Dict[str, Any]]:
    """Returns claims when a valid token is provided, otherwise None.

    Lets routes accept BOTH anonymous (device_id only) and authenticated users.
    """
    token = _extract_bearer(request)
    if not token:
        return None
    try:
        return verify_token(token)
    except HTTPException:
        return None


def user_id_of(claims: Optional[Dict[str, Any]]) -> Optional[str]:
    return claims.get("sub") if claims else None
