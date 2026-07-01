from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .enums import Role, TaskStatus


# ── Auth ──────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ── Users / clients ───────────────────────────────────────────────────────────
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: EmailStr
    name: str
    role: Role
    color: str
    is_active: bool
    created_at: datetime


class ClientCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=6)
    color: str = "#6366f1"


class ClientUpdate(BaseModel):
    name: str | None = None
    color: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6)


# ── Tasks ─────────────────────────────────────────────────────────────────────
class ProgressPoint(BaseModel):
    """A single milestone/checkpoint within a task."""

    id: str
    label: str = Field(min_length=1, max_length=200)
    done: bool = False
    done_at: datetime | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    # Admin-only: when creating on behalf of a client
    client_id: str | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)


class ProgressUpdate(BaseModel):
    """Replace a task's ordered checklist wholesale (admin only)."""

    progress_points: list[ProgressPoint]


class ScheduleEntry(BaseModel):
    """A single task placement when (re)ordering a day."""

    task_id: str
    order_index: int


class ReorderRequest(BaseModel):
    scheduled_date: date
    entries: list[ScheduleEntry]


class ScheduleTaskRequest(BaseModel):
    scheduled_date: date
    order_index: int | None = None  # appended to end if omitted


class CarryForwardRequest(BaseModel):
    target_date: date
    task_ids: list[str] | None = None  # all incomplete past tasks if omitted


class UrgentTaskRequest(BaseModel):
    """Drop an urgent task at the front of the queue and start it immediately.

    Either promote an existing task (``task_id``) or create a new one inline.
    """

    task_id: str | None = None
    title: str | None = Field(default=None, max_length=300)
    description: str | None = None
    estimated_minutes: int | None = Field(default=None, ge=0)
    client_id: str | None = None       # defaults to the admin (internal) when omitted
    scheduled_date: date | None = None  # defaults to today


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    description: str | None
    client_id: str
    estimated_minutes: int | None
    status: TaskStatus
    scheduled_date: date | None
    order_index: int
    timer_started_at: datetime | None
    accumulated_seconds: int
    actual_start: datetime | None
    actual_end: datetime | None
    proof_image_url: str | None
    completion_note: str | None
    progress_points: list[ProgressPoint] = []
    created_at: datetime
    updated_at: datetime

    # Derived / joined fields
    client_name: str | None = None
    client_color: str | None = None
    elapsed_seconds: int = 0          # live timer value at serialization time
    progress_percent: int = 0         # 0-100, from checked progress points (or status)
    planned_start: datetime | None = None
    planned_end: datetime | None = None


# ── Settings ──────────────────────────────────────────────────────────────────
class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    workday_start: time
    workday_hours: int
    admin_online: bool = False
    admin_online_since: datetime | None = None


class SettingsUpdate(BaseModel):
    workday_start: time | None = None
    workday_hours: int | None = Field(default=None, ge=1, le=24)


class PresenceUpdate(BaseModel):
    online: bool


# ── Stats ─────────────────────────────────────────────────────────────────────
class ClientStats(BaseModel):
    client_id: str
    client_name: str
    client_color: str
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    pending_tasks: int
    completion_rate: float
    estimated_minutes_total: int
    actual_minutes_total: int


Token.model_rebuild()
