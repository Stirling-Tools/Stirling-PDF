from __future__ import annotations

import logging
import logging.handlers
from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENGINE_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = ENGINE_ROOT / ".env"
ENV_LOCAL_FILE = ENGINE_ROOT / ".env.local"


class RagBackend(StrEnum):
    SQLITE = "sqlite"
    PGVECTOR = "pgvector"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ENV_FILE, ENV_LOCAL_FILE), extra="ignore", populate_by_name=True)

    smart_model_name: str = Field(validation_alias="STIRLING_SMART_MODEL")
    fast_model_name: str = Field(validation_alias="STIRLING_FAST_MODEL")
    smart_model_max_tokens: int = Field(validation_alias="STIRLING_SMART_MODEL_MAX_TOKENS")
    fast_model_max_tokens: int = Field(validation_alias="STIRLING_FAST_MODEL_MAX_TOKENS")

    # RAG settings — always on; the backend picks between embedded sqlite-vec and external pgvector.
    rag_backend: RagBackend = Field(validation_alias="STIRLING_RAG_BACKEND")
    rag_embedding_model: str = Field(validation_alias="STIRLING_RAG_EMBEDDING_MODEL")
    rag_store_path: Path = Field(validation_alias="STIRLING_RAG_STORE_PATH")
    rag_pgvector_dsn: str = Field(validation_alias="STIRLING_RAG_PGVECTOR_DSN")
    rag_chunk_size: int = Field(validation_alias="STIRLING_RAG_CHUNK_SIZE")
    rag_chunk_overlap: int = Field(validation_alias="STIRLING_RAG_CHUNK_OVERLAP")
    rag_default_top_k: int = Field(validation_alias="STIRLING_RAG_TOP_K")
    rag_max_searches: int = Field(validation_alias="STIRLING_RAG_MAX_SEARCHES")

    max_pages: int = Field(validation_alias="STIRLING_MAX_PAGES")
    max_characters: int = Field(validation_alias="STIRLING_MAX_CHARACTERS")

    log_level: str = Field(default="INFO", validation_alias="STIRLING_LOG_LEVEL")
    log_file: str = Field(default="", validation_alias="STIRLING_LOG_FILE")

    posthog_enabled: bool = Field(validation_alias="STIRLING_POSTHOG_ENABLED")
    posthog_api_key: str = Field(validation_alias="STIRLING_POSTHOG_API_KEY")
    posthog_host: str = Field(validation_alias="STIRLING_POSTHOG_HOST")


def _configure_logging(level_name: str, log_file: str) -> None:
    """Configure the ``stirling`` logger hierarchy."""
    level = logging.getLevelNamesMapping().get(level_name.upper())
    if level is None:
        logging.getLogger("stirling").warning(
            "Unknown STIRLING_LOG_LEVEL %r, defaulting to INFO",
            level_name,
        )
        level = logging.INFO

    root = logging.getLogger("stirling")
    root.setLevel(level)
    formatter = logging.Formatter("%(asctime)s %(levelname)s %(name)s [%(funcName)s] %(message)s")

    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        sh = logging.StreamHandler()
        sh.setFormatter(formatter)
        sh.setLevel(level)
        root.addHandler(sh)
        root.propagate = False

    if log_file:
        log_path = Path(log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        fh = logging.handlers.TimedRotatingFileHandler(
            log_path,
            when="midnight",
            backupCount=1,
            encoding="utf-8",
        )
        fh.setFormatter(formatter)
        fh.setLevel(level)
        root.addHandler(fh)


@lru_cache(maxsize=1)
def load_settings() -> AppSettings:
    load_dotenv(ENV_FILE)
    load_dotenv(ENV_LOCAL_FILE, override=True)
    settings = AppSettings.model_validate({})
    _configure_logging(settings.log_level, settings.log_file)
    return settings
