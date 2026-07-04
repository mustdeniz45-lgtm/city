"""Supabase client (service-role) used by FastAPI for privileged backend ops.

This is the ONLY data backend as of 2026-07-04 (Mongo has been retired).
The service-role key bypasses RLS by design — it's kept in
`backend/.env` and never shipped to clients.
"""
import os
from typing import Optional
from supabase import create_client, Client

_client: Optional[Client] = None


def get_supabase() -> Optional[Client]:
    """Return a singleton service-role Supabase client, or None if the env
    isn't configured (used by health checks to report a helpful message).
    """
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    _client = create_client(url, key)
    return _client

