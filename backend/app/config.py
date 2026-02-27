"""Application configuration."""
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment."""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dppe"

    # JWT / Auth
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    # SSO
    sso_issuer_url: str = ""
    sso_client_id: str = ""
    sso_client_secret: str = ""
    sso_redirect_uri: str = ""

    # OpenAI
    openai_api_key: str = ""

    # Application
    app_env: str = "development"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Financial thresholds
    margin_threshold_warning: float = 15.0
    effort_override_threshold: float = 15.0

    # Sprint/effort defaults (used when sprint_config or project data missing)
    default_working_days_per_month: int = 20
    default_sprint_duration_weeks: int = 2
    default_hours_per_day: int = 8
    default_utilization_pct: float = 80.0

    # Task contingency by seniority (Jr=1.15, Sr=1.05, default=1.10)
    task_contingency_junior: float = 1.15
    task_contingency_senior: float = 1.05
    task_contingency_default: float = 1.10

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
