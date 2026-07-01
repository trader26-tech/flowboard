from datetime import datetime

from .enums import TaskStatus
from .scheduling import live_elapsed_seconds
from .schemas import TaskOut


def _progress_percent(task: dict) -> int:
    """Percent complete from checked progress points; falls back to status."""
    points = task.get("progress_points") or []
    if points:
        done = sum(1 for p in points if p.get("done"))
        return round(done / len(points) * 100)
    return 100 if task.get("status") == TaskStatus.completed.value else 0


def serialize_task(
    task: dict,
    planned: tuple[datetime, datetime] | None = None,
) -> TaskOut:
    out = TaskOut.model_validate(task)
    out.elapsed_seconds = live_elapsed_seconds(task)
    out.progress_percent = _progress_percent(task)
    out.client_name = task.get("client_name")
    out.client_color = task.get("client_color")
    if planned is not None:
        out.planned_start, out.planned_end = planned
    return out
