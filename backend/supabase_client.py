"""Supabase client (service-role) used by FastAPI for privileged backend ops."""
import os
from typing import Optional
from supabase import create_client, Client

_client: Optional[Client] = None


def get_supabase() -> Optional[Client]:
    """Return a singleton service-role Supabase client, or None if not configured."""
    global _client
    if _client is not None:
        return _client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    _client = create_client(url, key)
    return _client


def data_backend() -> str:
    """`mongo` (default) or `supabase`. Set via DATA_BACKEND env var."""
    return os.environ.get("DATA_BACKEND", "mongo").lower()
