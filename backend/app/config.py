from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CRYO_", env_file=BACKEND_ROOT / ".env", extra="ignore"
    )
    database_path: Path = Path("data/cryocore.sqlite3")
    download_directory: Path = Path("data/downloads")
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    nasa_timeout_seconds: float = Field(default=30, gt=0, le=120)
    earthdata_token: SecretStr | None = Field(default=None, validation_alias="EARTHDATA_TOKEN", exclude=True)

    @property
    def resolved_database_path(self) -> Path:
        return (BACKEND_ROOT / self.database_path).resolve()

    @property
    def resolved_download_directory(self) -> Path:
        return (BACKEND_ROOT / self.download_directory).resolve()
