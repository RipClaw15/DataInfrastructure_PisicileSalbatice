from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Resolve backend/.env independently of the terminal's working directory.
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Optional while the deployed app does not have a database configured.
    database_url: str | None = None
    db_pool_timeout_seconds: float = Field(default=2, gt=0)
    db_statement_timeout_ms: int = Field(default=3000, gt=0)
    db_lock_timeout_ms: int = Field(default=1000, gt=0)
    db_tcp_user_timeout_ms: int = Field(default=5000, gt=0)
    # Temporary development setting. Override with explicit origins for production.
    cors_origins: str = "*"
    alert_gps_interval_seconds: float = Field(default=30, gt=0)
    alert_gps_distance_meters: float = Field(default=25, gt=0)


settings = Settings()
