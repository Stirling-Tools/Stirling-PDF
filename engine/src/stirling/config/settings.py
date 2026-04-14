from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENGINE_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = ENGINE_ROOT / ".env"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore", populate_by_name=True)

    smart_model_name: str = Field(validation_alias="STIRLING_SMART_MODEL")
    fast_model_name: str = Field(validation_alias="STIRLING_FAST_MODEL")
    smart_model_max_tokens: int = Field(validation_alias="STIRLING_SMART_MODEL_MAX_TOKENS")
    fast_model_max_tokens: int = Field(validation_alias="STIRLING_FAST_MODEL_MAX_TOKENS")

    posthog_enabled: bool = Field(validation_alias="STIRLING_POSTHOG_ENABLED")
    posthog_api_key: str = Field(validation_alias="STIRLING_POSTHOG_API_KEY")
    posthog_host: str = Field(validation_alias="STIRLING_POSTHOG_HOST")


@lru_cache(maxsize=1)
def load_settings() -> AppSettings:
    load_dotenv(ENV_FILE)
    return AppSettings.model_validate({})
