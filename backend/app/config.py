from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Supabase — the only backing service. The REST API is used for both data and storage.
    supabase_url: str = ""
    supabase_service_key: str = ""  # service_role key (server-side only; bypasses RLS)
    supabase_bucket: str = "task-proofs"

    # Auth
    jwt_secret: str = "change_me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 10080  # 7 days

    # First admin bootstrap
    admin_email: str = "admin@example.com"
    admin_password: str = "change_me"
    admin_name: str = "Admin"

    # App
    environment: str = "development"
    cors_origins: str = "http://localhost:4200"
    workday_start: str = "09:00"
    workday_hours: int = 10

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
