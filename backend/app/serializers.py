from datetime import datetime

from .scheduling import live_elapsed_seconds
from .schemas import TaskOut


def serialize_task(
    task: dict,
    planned: tuple[datetime, datetime] | None = None,
) -> TaskOut:
    out = TaskOut.model_validate(task)
    out.elapsed_seconds = live_elapsed_seconds(task)
    out.client_name = task.get("client_name")
    out.client_color = task.get("client_color")
    if planned is not None:
        out.planned_start, out.planned_end = planned
    return out
