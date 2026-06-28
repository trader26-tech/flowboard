"""Data-access layer over the Supabase REST API (PostgREST).

Every function returns plain dicts (or lists of dicts) matching the table columns.
Tasks returned by the list helpers are enriched with ``client_name`` / ``client_color``.
"""

from datetime import datetime, timezone
from typing import Any

from .enums import Role, TaskStatus
from .supabase_client import get_client

USERS = "users"
TASKS = "tasks"
SETTINGS = "app_settings"

INCOMPLETE = [
    TaskStatus.requested.value,
    TaskStatus.scheduled.value,
    TaskStatus.in_progress.value,
]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Users ─────────────────────────────────────────────────────────────────────
async def get_user(user_id: str) -> dict | None:
    c = await get_client()
    res = await c.table(USERS).select("*").eq("id", user_id).limit(1).execute()
    return res.data[0] if res.data else None


async def get_user_by_email(email: str) -> dict | None:
    c = await get_client()
    res = await c.table(USERS).select("*").eq("email", email.lower()).limit(1).execute()
    return res.data[0] if res.data else None


async def get_admin() -> dict | None:
    c = await get_client()
    res = await c.table(USERS).select("*").eq("role", Role.admin.value).limit(1).execute()
    return res.data[0] if res.data else None


async def list_clients() -> list[dict]:
    c = await get_client()
    res = (
        await c.table(USERS)
        .select("*")
        .eq("role", Role.client.value)
        .order("created_at")
        .execute()
    )
    return res.data or []


async def create_user(payload: dict) -> dict:
    c = await get_client()
    res = await c.table(USERS).insert(payload).execute()
    return res.data[0]


async def update_user(user_id: str, fields: dict) -> dict | None:
    c = await get_client()
    res = await c.table(USERS).update(fields).eq("id", user_id).execute()
    return res.data[0] if res.data else None


async def delete_user(user_id: str) -> None:
    c = await get_client()
    await c.table(USERS).delete().eq("id", user_id).execute()


# ── Tasks ─────────────────────────────────────────────────────────────────────
async def _attach_clients(tasks: list[dict]) -> list[dict]:
    if not tasks:
        return tasks
    client_ids = list({t["client_id"] for t in tasks})
    c = await get_client()
    res = await c.table(USERS).select("id,name,color").in_("id", client_ids).execute()
    by_id = {u["id"]: u for u in (res.data or [])}
    for t in tasks:
        u = by_id.get(t["client_id"])
        t["client_name"] = u["name"] if u else None
        t["client_color"] = u["color"] if u else None
    return tasks


async def get_task(task_id: str) -> dict | None:
    c = await get_client()
    res = await c.table(TASKS).select("*").eq("id", task_id).limit(1).execute()
    if not res.data:
        return None
    return (await _attach_clients([res.data[0]]))[0]


async def list_tasks(
    *, client_id: str | None = None, status: str | None = None
) -> list[dict]:
    c = await get_client()
    q = c.table(TASKS).select("*")
    if client_id:
        q = q.eq("client_id", client_id)
    if status:
        q = q.eq("status", status)
    res = await q.order("created_at", desc=True).execute()
    return await _attach_clients(res.data or [])


async def list_all_tasks() -> list[dict]:
    c = await get_client()
    res = await c.table(TASKS).select("*").execute()
    return res.data or []


async def backlog() -> list[dict]:
    c = await get_client()
    res = (
        await c.table(TASKS)
        .select("*")
        .eq("status", TaskStatus.requested.value)
        .is_("scheduled_date", "null")
        .order("created_at")
        .execute()
    )
    return await _attach_clients(res.data or [])


async def day_tasks(day: str, client_id: str | None = None) -> list[dict]:
    c = await get_client()
    q = c.table(TASKS).select("*").eq("scheduled_date", day)
    if client_id:
        q = q.eq("client_id", client_id)
    res = await q.order("order_index").execute()
    return await _attach_clients(res.data or [])


async def overdue(before: str) -> list[dict]:
    c = await get_client()
    res = (
        await c.table(TASKS)
        .select("*")
        .lt("scheduled_date", before)
        .in_("status", INCOMPLETE)
        .order("scheduled_date")
        .order("order_index")
        .execute()
    )
    return await _attach_clients(res.data or [])


async def create_task(payload: dict) -> dict:
    c = await get_client()
    res = await c.table(TASKS).insert(payload).execute()
    return (await _attach_clients([res.data[0]]))[0]


async def update_task(task_id: str, fields: dict) -> dict | None:
    c = await get_client()
    fields = {**fields, "updated_at": _now_iso()}
    res = await c.table(TASKS).update(fields).eq("id", task_id).execute()
    if not res.data:
        return None
    return (await _attach_clients([res.data[0]]))[0]


async def delete_task(task_id: str) -> None:
    c = await get_client()
    await c.table(TASKS).delete().eq("id", task_id).execute()


async def next_order_index(day: str) -> int:
    c = await get_client()
    res = (
        await c.table(TASKS)
        .select("order_index")
        .eq("scheduled_date", day)
        .order("order_index", desc=True)
        .limit(1)
        .execute()
    )
    if res.data:
        return (res.data[0]["order_index"] or 0) + 1
    return 0


async def get_tasks_by_ids(ids: list[str]) -> list[dict]:
    if not ids:
        return []
    c = await get_client()
    res = await c.table(TASKS).select("*").in_("id", ids).execute()
    return res.data or []


# ── Settings ──────────────────────────────────────────────────────────────────
async def get_settings_row() -> dict | None:
    c = await get_client()
    res = await c.table(SETTINGS).select("*").eq("id", 1).limit(1).execute()
    return res.data[0] if res.data else None


async def upsert_settings(fields: dict[str, Any]) -> dict:
    c = await get_client()
    payload = {"id": 1, **fields}
    res = await c.table(SETTINGS).upsert(payload).execute()
    return res.data[0]
