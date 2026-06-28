"""Single shared async Supabase client.

Everything (data + storage) goes through the Supabase REST API using the service-role
key, so the only configuration needed is SUPABASE_URL + SUPABASE_SERVICE_KEY.
"""

from supabase import AsyncClient, create_async_client

from .config import settings

_client: AsyncClient | None = None


async def get_client() -> AsyncClient:
    global _client
    if _client is None:
        if not settings.supabase_url or not settings.supabase_service_key:
            raise RuntimeError(
                "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY "
                "(the service_role key) in your environment."
            )
        _client = await create_async_client(
            settings.supabase_url, settings.supabase_service_key
        )
    return _client
