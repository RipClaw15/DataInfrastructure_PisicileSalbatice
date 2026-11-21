from pathlib import Path

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
    cors_origins: str = "http://localhost:5173"


settings = Settings()
