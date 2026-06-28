from fastapi import APIRouter, Depends

from .. import db
from ..deps import get_current_user, require_admin
from ..enums import TaskStatus
from ..schemas import ClientStats

router = APIRouter(prefix="/stats", tags=["stats"])


def _build_stats(client: dict, tasks: list[dict]) -> ClientStats:
    total = len(tasks)
    completed = sum(1 for t in tasks if t["status"] == TaskStatus.completed.value)
    in_progress = sum(1 for t in tasks if t["status"] == TaskStatus.in_progress.value)
    pending = sum(
        1 for t in tasks
        if t["status"] in (TaskStatus.requested.value, TaskStatus.scheduled.value)
    )
    estimated = sum(t.get("estimated_minutes") or 0 for t in tasks)
    actual = sum(
        (t.get("accumulated_seconds") or 0) // 60
        for t in tasks
        if t["status"] == TaskStatus.completed.value
    )
    return ClientStats(
        client_id=client["id"],
        client_name=client["name"],
        client_color=client["color"],
        total_tasks=total,
        completed_tasks=completed,
        in_progress_tasks=in_progress,
        pending_tasks=pending,
        completion_rate=round(completed / total * 100, 1) if total else 0.0,
        estimated_minutes_total=estimated,
        actual_minutes_total=actual,
    )


@router.get("/clients", response_model=list[ClientStats])
async def all_client_stats(_: dict = Depends(require_admin)):
    clients = await db.list_clients()
    tasks = await db.list_all_tasks()
    by_client: dict[str, list[dict]] = {}
    for t in tasks:
        by_client.setdefault(t["client_id"], []).append(t)
    return [_build_stats(c, by_client.get(c["id"], [])) for c in clients]


@router.get("/me", response_model=ClientStats)
async def my_stats(user: dict = Depends(get_current_user)):
    tasks = await db.list_tasks(client_id=user["id"])
    return _build_stats(user, tasks)
