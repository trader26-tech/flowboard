from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from .. import db
from ..deps import get_current_user, require_admin
from ..enums import Role, TaskStatus
from ..schemas import (
    CarryForwardRequest,
    ProgressUpdate,
    ReorderRequest,
    ScheduleTaskRequest,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    UrgentTaskRequest,
)
from ..scheduling import compute_timeline, live_elapsed_seconds
from ..serializers import serialize_task
from ..storage import upload_proof_image
from .settings import get_workday_start

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_task_for_user(task_id: str, user: dict) -> dict:
    task = await db.get_task(task_id)
    if task is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
    if user["role"] == Role.client.value and task["client_id"] != user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your task")
    return task


# ── Listing ───────────────────────────────────────────────────────────────────
@router.get("", response_model=list[TaskOut])
async def list_tasks(
    user: dict = Depends(get_current_user),
    status_filter: TaskStatus | None = Query(default=None, alias="status"),
    client_id: str | None = None,
):
    if user["role"] == Role.client.value:
        tasks = await db.list_tasks(client_id=user["id"], status=status_filter.value if status_filter else None)
    else:
        tasks = await db.list_tasks(client_id=client_id, status=status_filter.value if status_filter else None)
    return [serialize_task(t) for t in tasks]


@router.get("/backlog", response_model=list[TaskOut])
async def backlog(_: dict = Depends(require_admin)):
    """Requested tasks not yet placed on any day — the admin's pickup queue."""
    return [serialize_task(t) for t in await db.backlog()]


@router.get("/schedule", response_model=list[TaskOut])
async def day_schedule(
    day: date = Query(alias="date"),
    user: dict = Depends(get_current_user),
):
    """Ordered tasks for a single day with computed planned start/end times."""
    client_id = user["id"] if user["role"] == Role.client.value else None
    tasks = await db.day_tasks(day.isoformat(), client_id=client_id)
    timeline = compute_timeline(tasks, day, await get_workday_start())
    return [serialize_task(t, timeline.get(t["id"])) for t in tasks]


@router.get("/mine", response_model=list[TaskOut])
async def my_tasks(user: dict = Depends(get_current_user)):
    """All of the caller's tasks, with tentative planned start/end for scheduled ones.

    ETAs depend on everything queued ahead of the task (across all clients), so we
    compute the full-day timeline for each relevant day and pull out the caller's rows.
    """
    tasks = await db.list_tasks(client_id=user["id"])
    dates = {t["scheduled_date"] for t in tasks if t.get("scheduled_date")}
    workday_start = await get_workday_start()

    planned: dict[str, tuple] = {}
    for day_str in dates:
        day_all = await db.day_tasks(day_str)  # every client's tasks, ordered
        timeline = compute_timeline(day_all, date.fromisoformat(day_str), workday_start)
        planned.update(timeline)

    return [serialize_task(t, planned.get(t["id"])) for t in tasks]


@router.get("/overdue", response_model=list[TaskOut])
async def overdue(
    before: date = Query(alias="before"),
    _: dict = Depends(require_admin),
):
    """Incomplete tasks scheduled on a day earlier than `before` — carry-forward candidates."""
    return [serialize_task(t) for t in await db.overdue(before.isoformat())]


# ── Create / update / delete ──────────────────────────────────────────────────
@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, user: dict = Depends(get_current_user)):
    if user["role"] == Role.client.value:
        client_id = user["id"]
    elif not payload.client_id:
        # Admin creating an internal task for themselves.
        client_id = user["id"]
    else:
        target = await db.get_user(payload.client_id)
        if target is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignee not found")
        client_id = payload.client_id

    return serialize_task(
        await db.create_task(
            {
                "title": payload.title,
                "description": payload.description,
                "estimated_minutes": payload.estimated_minutes,
                "client_id": client_id,
                "status": TaskStatus.requested.value,
            }
        )
    )


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, payload: TaskUpdate, user: dict = Depends(get_current_user)):
    task = await _get_task_for_user(task_id, user)
    if user["role"] == Role.client.value and task["status"] != TaskStatus.requested.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Task can no longer be edited")

    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        return serialize_task(task)
    return serialize_task(await db.update_task(task_id, fields))


@router.patch("/{task_id}/progress", response_model=TaskOut)
async def set_progress(
    task_id: str, payload: ProgressUpdate, admin: dict = Depends(require_admin)
):
    """Replace a task's ordered progress checklist. Stamps done_at when a point flips done."""
    task = await _get_task_for_user(task_id, admin)
    existing = {p.get("id"): p for p in (task.get("progress_points") or [])}
    now = _utcnow_iso()
    points = []
    for p in payload.progress_points:
        prev = existing.get(p.id)
        done_at = None
        if p.done:
            done_at = (prev.get("done_at") if prev and prev.get("done") else None) or now
        points.append({"id": p.id, "label": p.label, "done": p.done, "done_at": done_at})
    return serialize_task(await db.update_task(task_id, {"progress_points": points}))


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    task = await _get_task_for_user(task_id, user)
    if user["role"] == Role.client.value and task["status"] != TaskStatus.requested.value:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Task can no longer be cancelled")
    await db.delete_task(task_id)


# ── Scheduling (admin) ────────────────────────────────────────────────────────
@router.post("/{task_id}/schedule", response_model=TaskOut)
async def schedule_task(
    task_id: str, payload: ScheduleTaskRequest, admin: dict = Depends(require_admin)
):
    task = await _get_task_for_user(task_id, admin)
    day = payload.scheduled_date.isoformat()
    order_index = (
        payload.order_index
        if payload.order_index is not None
        else await db.next_order_index(day)
    )
    fields = {"scheduled_date": day, "order_index": order_index}
    if task["status"] == TaskStatus.requested.value:
        fields["status"] = TaskStatus.scheduled.value
    return serialize_task(await db.update_task(task_id, fields))


@router.post("/{task_id}/unschedule", response_model=TaskOut)
async def unschedule_task(task_id: str, admin: dict = Depends(require_admin)):
    task = await _get_task_for_user(task_id, admin)
    if task["status"] in (TaskStatus.in_progress.value, TaskStatus.completed.value):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot unschedule a started task")
    return serialize_task(
        await db.update_task(
            task_id,
            {"scheduled_date": None, "order_index": 0, "status": TaskStatus.requested.value},
        )
    )


@router.post("/reorder", response_model=list[TaskOut])
async def reorder_day(payload: ReorderRequest, _: dict = Depends(require_admin)):
    day = payload.scheduled_date.isoformat()
    ids = [e.task_id for e in payload.entries]
    existing = {t["id"]: t for t in await db.get_tasks_by_ids(ids)}
    for entry in payload.entries:
        task = existing.get(entry.task_id)
        if task is None:
            continue
        fields = {"order_index": entry.order_index, "scheduled_date": day}
        if task["status"] == TaskStatus.requested.value:
            fields["status"] = TaskStatus.scheduled.value
        await db.update_task(entry.task_id, fields)

    tasks = await db.day_tasks(day)
    timeline = compute_timeline(tasks, payload.scheduled_date, await get_workday_start())
    return [serialize_task(t, timeline.get(t["id"])) for t in tasks]


@router.post("/carry-forward", response_model=list[TaskOut])
async def carry_forward(payload: CarryForwardRequest, _: dict = Depends(require_admin)):
    """Move incomplete tasks onto `target_date`, appended after whatever is already there."""
    target = payload.target_date.isoformat()
    if payload.task_ids:
        candidates = [
            t for t in await db.get_tasks_by_ids(payload.task_ids)
            if t["status"] in db.INCOMPLETE
        ]
        candidates.sort(key=lambda t: (t.get("scheduled_date") or "", t.get("order_index", 0)))
    else:
        candidates = await db.overdue(target)

    next_index = await db.next_order_index(target)
    moved = []
    for task in candidates:
        fields = {"scheduled_date": target, "order_index": next_index}
        if task["status"] == TaskStatus.requested.value:
            fields["status"] = TaskStatus.scheduled.value
        moved.append(await db.update_task(task["id"], fields))
        next_index += 1
    return [serialize_task(t) for t in moved]


@router.post("/urgent", response_model=list[TaskOut])
async def urgent_task(payload: UrgentTaskRequest, admin: dict = Depends(require_admin)):
    """Insert an urgent task at the front of the day and start it right now.

    Any task currently running is paused first — its worked ("completed") time is kept
    in ``accumulated_seconds`` and its remaining work is re-queued *after* the urgent
    task. Everything below is pushed down by the urgent task's estimate via the timeline.
    """
    day = (payload.scheduled_date or datetime.now(timezone.utc).date()).isoformat()
    now = _utcnow_iso()

    # 1. Resolve the urgent task — promote an existing one or create it inline.
    if payload.task_id:
        urgent = await _get_task_for_user(payload.task_id, admin)
    else:
        if not payload.title:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "title is required for a new urgent task")
        urgent = await db.create_task(
            {
                "title": payload.title,
                "description": payload.description,
                "estimated_minutes": payload.estimated_minutes,
                "client_id": payload.client_id or admin["id"],
                "status": TaskStatus.scheduled.value,
            }
        )

    # 2. Pause whatever is running today (keep its worked time, re-queue the remainder).
    for t in await db.day_tasks(day):
        if t["status"] == TaskStatus.in_progress.value and t["id"] != urgent["id"]:
            await db.update_task(
                t["id"],
                {
                    "accumulated_seconds": live_elapsed_seconds(t),
                    "timer_started_at": None,
                    "status": TaskStatus.scheduled.value,
                },
            )

    # 3. Reorder: completed stay on top, urgent next, then everything else in order.
    day_tasks = await db.day_tasks(day)
    completed = [t for t in day_tasks if t["status"] == TaskStatus.completed.value and t["id"] != urgent["id"]]
    others = [t for t in day_tasks if t["status"] != TaskStatus.completed.value and t["id"] != urgent["id"]]
    ordered_ids = [t["id"] for t in completed] + [urgent["id"]] + [t["id"] for t in others]
    for idx, tid in enumerate(ordered_ids):
        await db.update_task(tid, {"order_index": idx})

    # 4. Start the urgent task now.
    start_fields: dict = {
        "timer_started_at": now,
        "status": TaskStatus.in_progress.value,
        "scheduled_date": day,
    }
    if urgent.get("actual_start") is None:
        start_fields["actual_start"] = now
    await db.update_task(urgent["id"], start_fields)

    tasks = await db.day_tasks(day)
    timeline = compute_timeline(tasks, date.fromisoformat(day), await get_workday_start())
    return [serialize_task(t, timeline.get(t["id"])) for t in tasks]


# ── Timer (admin) ─────────────────────────────────────────────────────────────
@router.post("/{task_id}/start", response_model=TaskOut)
async def start_timer(task_id: str, admin: dict = Depends(require_admin)):
    task = await _get_task_for_user(task_id, admin)
    if task["status"] == TaskStatus.completed.value:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Task already completed")
    now = _utcnow_iso()
    fields: dict = {"timer_started_at": now, "status": TaskStatus.in_progress.value}
    if task.get("actual_start") is None:
        fields["actual_start"] = now
    if task.get("scheduled_date") is None:
        today = datetime.now(timezone.utc).date().isoformat()
        fields["scheduled_date"] = today
        fields["order_index"] = await db.next_order_index(today)
    return serialize_task(await db.update_task(task_id, fields))


@router.post("/{task_id}/pause", response_model=TaskOut)
async def pause_timer(task_id: str, admin: dict = Depends(require_admin)):
    task = await _get_task_for_user(task_id, admin)
    fields = {"accumulated_seconds": live_elapsed_seconds(task), "timer_started_at": None}
    if task["status"] == TaskStatus.in_progress.value:
        fields["status"] = TaskStatus.scheduled.value
    return serialize_task(await db.update_task(task_id, fields))


@router.post("/{task_id}/complete", response_model=TaskOut)
async def complete_task(
    task_id: str,
    note: str | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    admin: dict = Depends(require_admin),
):
    task = await _get_task_for_user(task_id, admin)
    now = _utcnow_iso()
    fields: dict = {
        "accumulated_seconds": live_elapsed_seconds(task),
        "timer_started_at": None,
        "actual_end": now,
        "status": TaskStatus.completed.value,
        "completion_note": note,
    }
    if task.get("actual_start") is None:
        fields["actual_start"] = now
    if image is not None:
        fields["proof_image_url"] = await upload_proof_image(image)
    return serialize_task(await db.update_task(task_id, fields))
