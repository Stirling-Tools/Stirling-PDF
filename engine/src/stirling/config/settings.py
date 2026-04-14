from __future__ import annotations

import logging
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
    log_level: str = Field(default="INFO", validation_alias="STIRLING_LOG_LEVEL")
    ai_trace: bool = Field(default=False, validation_alias="STIRLING_AI_TRACE")


def _configure_logging(level_name: str) -> None:
    """Set the root ``stirling`` logger level from the environment."""
    level = logging.getLevelNamesMapping().get(level_name.upper())
    if level is None:
        logging.getLogger("stirling").warning(
            "Unknown STIRLING_LOG_LEVEL %r, defaulting to INFO",
            level_name,
        )
        level = logging.INFO
    logging.getLogger("stirling").setLevel(level)


@lru_cache(maxsize=1)
def load_settings() -> AppSettings:
    load_dotenv(ENV_FILE)
    settings = AppSettings.model_validate({})
    _configure_logging(settings.log_level)
    return settings
