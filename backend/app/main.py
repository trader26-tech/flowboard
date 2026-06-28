import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db
from .config import settings
from .enums import Role
from .routers import auth, clients, settings as settings_router, stats, tasks
from .routers.settings import get_or_create_settings
from .security import hash_password

logger = logging.getLogger("flowboard")


async def _bootstrap() -> None:
    """Ensure a settings row and a first admin exist. Requires the tables (schema.sql) to exist."""
    try:
        await get_or_create_settings()
        if await db.get_admin() is None:
            await db.create_user(
                {
                    "email": settings.admin_email.lower(),
                    "name": settings.admin_name,
                    "password_hash": hash_password(settings.admin_password),
                    "role": Role.admin.value,
                    "color": "#0f172a",
                }
            )
            logger.info("Bootstrapped admin user %s", settings.admin_email)
    except Exception as exc:  # don't crash boot; surface a clear hint instead
        logger.warning(
            "Bootstrap skipped (%s). Did you run schema.sql in Supabase and set "
            "SUPABASE_URL / SUPABASE_SERVICE_KEY?", exc,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _bootstrap()
    yield


app = FastAPI(title="FlowBoard API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(clients.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/api/health", tags=["health"])
async def health():
    return {"status": "ok", "environment": settings.environment}
