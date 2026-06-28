"""Timeline computation.

The admin works a ~10-hour day starting at a configurable time. Tasks on a day are
ordered by ``order_index``. We compute planned start/end times by walking the ordered
list with a moving cursor:

* completed tasks anchor the cursor to their *actual* end time, so finishing early
  automatically prepones everything below and finishing late postpones it.
* in-progress tasks anchor to their actual start and project forward by their estimate.
* not-yet-started tasks fill forward from the cursor using their estimate (or a default).

Nothing is persisted — the timeline is always derived from the source of truth.
Tasks are plain dicts (rows from Supabase); datetime columns arrive as ISO strings.
"""

from datetime import date, datetime, time, timedelta, timezone

from .enums import TaskStatus

DEFAULT_TASK_MINUTES = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_dt(value) -> datetime | None:
    """Parse an ISO datetime string (or pass through a datetime); assume UTC if naive."""
    if value is None:
        return None
    dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def live_elapsed_seconds(task: dict) -> int:
    """Accumulated work seconds including any currently-running timer span."""
    elapsed = task.get("accumulated_seconds") or 0
    started = parse_dt(task.get("timer_started_at"))
    if started is not None and task.get("status") == TaskStatus.in_progress.value:
        elapsed += int((_utcnow() - started).total_seconds())
    return max(elapsed, 0)


def _duration(task: dict) -> timedelta:
    est = task.get("estimated_minutes")
    return timedelta(minutes=est if est else DEFAULT_TASK_MINUTES)


def compute_timeline(
    tasks: list[dict], day: date, workday_start: time
) -> dict[str, tuple[datetime, datetime]]:
    """Return {task_id: (planned_start, planned_end)} for an ordered list of one day's tasks."""
    cursor = datetime.combine(day, workday_start, tzinfo=timezone.utc)
    result: dict[str, tuple[datetime, datetime]] = {}

    for task in sorted(tasks, key=lambda t: t.get("order_index", 0)):
        status = task.get("status")
        a_start = parse_dt(task.get("actual_start"))
        a_end = parse_dt(task.get("actual_end"))

        if status == TaskStatus.completed.value and a_start and a_end:
            start, end = a_start, a_end
            cursor = max(cursor, end)
        elif status == TaskStatus.in_progress.value and a_start:
            start = a_start
            end = max(start + _duration(task), _utcnow())
            cursor = end
        else:
            start = cursor
            end = cursor + _duration(task)
            cursor = end
        result[task["id"]] = (start, end)

    return result
