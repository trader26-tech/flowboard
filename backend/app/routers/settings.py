from datetime import time

from fastapi import APIRouter, Depends

from .. import db
from ..config import settings as app_config
from ..deps import get_current_user, require_admin
from ..schemas import SettingsOut, SettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


def _parse_time(value: str) -> time:
    parts = str(value).split(":")
    return time(int(parts[0]), int(parts[1]))


async def get_or_create_settings() -> dict:
    row = await db.get_settings_row()
    if row is None:
        row = await db.upsert_settings(
            {
                "workday_start": f"{app_config.workday_start}:00"
                if len(app_config.workday_start) == 5
                else app_config.workday_start,
                "workday_hours": app_config.workday_hours,
            }
        )
    return row


async def get_workday_start() -> time:
    row = await get_or_create_settings()
    return _parse_time(row["workday_start"])


@router.get("", response_model=SettingsOut)
async def read_settings(_: dict = Depends(get_current_user)):
    return await get_or_create_settings()


@router.patch("", response_model=SettingsOut)
async def update_settings(payload: SettingsUpdate, _: dict = Depends(require_admin)):
    await get_or_create_settings()
    fields: dict = {}
    if payload.workday_start is not None:
        fields["workday_start"] = payload.workday_start.isoformat()
    if payload.workday_hours is not None:
        fields["workday_hours"] = payload.workday_hours
    return await db.upsert_settings(fields)
