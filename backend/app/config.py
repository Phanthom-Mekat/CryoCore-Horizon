from pathlib import Path

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="CRYO_", env_file=BACKEND_ROOT / ".env", extra="ignore"
    )
    database_path: Path = Path("data/cryocore.sqlite3")
    # Raw downloads (data/raw) and published curated-case bundles (data/cases) live here, outside SQLite.
    data_dir: Path = Path("data")
    download_directory: Path = Path("data/downloads")
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    nasa_timeout_seconds: float = Field(default=30, gt=0, le=120)
    # NASA Earthdata Login bearer token for protected NISAR downloads (EARTHDATA_TOKEN; CRYO_EARTHDATA_TOKEN also
    # works). Server-side only. The curated-case worker falls back to ~/.netrc or ~/_netrc.
    earthdata_token: SecretStr | None = Field(
        default=None, exclude=True,
        validation_alias=AliasChoices("EARTHDATA_TOKEN", "CRYO_EARTHDATA_TOKEN", "earthdata_token"))
    # Required in the X-Admin-Token header for POST /api/v1/jobs. Unset disables job creation.
    admin_token: SecretStr | None = None
    job_max_attempts: int = Field(default=3, ge=1, le=20)
    # A running job whose heartbeat is older than this is considered abandoned and requeued.
    job_stale_seconds: int = Field(default=3600, ge=60)
    # QA only: serve a bundle whose manifest says synthetic_fixture (made from test fixtures, never NISAR). Off by default.
    allow_synthetic_qa: bool = False
    # Case assistant (app/assistant.py): Google AI Studio key, server-side only. Unset disables the assistant.
    gemini_api_key: SecretStr | None = Field(
        default=None, exclude=True, validation_alias=AliasChoices("GEMINI_API_KEY", "CRYO_GEMINI_API_KEY", "gemini_api_key"))
    gemini_model: str = "gemini-3.5-flash"
    # Used when the main model is busy, hanging or out of quota (it then rests for 2 minutes). Empty string: no fallback.
    gemini_fallback_model: str | None = "gemini-3.8-flash"
    # Across all viewers: every question spends Gemini calls on the owner's key.
    assistant_requests_per_minute: int = Field(default=20, ge=1, le=600)

    @property
    def resolved_database_path(self) -> Path:
        return (BACKEND_ROOT / self.database_path).resolve()

    @property
    def resolved_data_dir(self) -> Path:
        return (BACKEND_ROOT / self.data_dir).resolve()

    @property
    def resolved_download_directory(self) -> Path:
        return (BACKEND_ROOT / self.download_directory).resolve()
