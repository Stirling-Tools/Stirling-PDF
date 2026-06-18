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


class DocumentsBackend(StrEnum):
    SQLITE = "sqlite"
    PGVECTOR = "pgvector"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(ENV_FILE, ENV_LOCAL_FILE), extra="ignore", populate_by_name=True)

    smart_model_name: str = Field(validation_alias="STIRLING_SMART_MODEL")
    fast_model_name: str = Field(validation_alias="STIRLING_FAST_MODEL")
    smart_model_max_tokens: int = Field(validation_alias="STIRLING_SMART_MODEL_MAX_TOKENS")
    fast_model_max_tokens: int = Field(validation_alias="STIRLING_FAST_MODEL_MAX_TOKENS")
    # Process-wide ceiling on concurrent model API calls, shared by both model
    # tiers. Per-request fan-outs (chunked reasoner, contradiction detection)
    # carry their own per-request caps, but those multiply under concurrent
    # traffic; this is the global backstop.
    model_max_concurrency: int = Field(validation_alias="STIRLING_MODEL_MAX_CONCURRENCY")

    # Document store: the one database holding vector chunks, ordered page
    # text, and ACL rows - embedded sqlite-vec or external pgvector.
    documents_backend: DocumentsBackend = Field(validation_alias="STIRLING_DOCUMENTS_BACKEND")
    documents_sqlite_path: Path = Field(validation_alias="STIRLING_DOCUMENTS_SQLITE_PATH")
    documents_pgvector_dsn: str = Field(validation_alias="STIRLING_DOCUMENTS_PGVECTOR_DSN")
    documents_pgvector_pool_min_size: int = Field(validation_alias="STIRLING_DOCUMENTS_PGVECTOR_POOL_MIN_SIZE")
    documents_pgvector_pool_max_size: int = Field(validation_alias="STIRLING_DOCUMENTS_PGVECTOR_POOL_MAX_SIZE")

    # RAG settings - always on.
    rag_embedding_model: str = Field(validation_alias="STIRLING_RAG_EMBEDDING_MODEL")
    rag_chunk_size: int = Field(validation_alias="STIRLING_RAG_CHUNK_SIZE")
    rag_chunk_overlap: int = Field(validation_alias="STIRLING_RAG_CHUNK_OVERLAP")
    rag_default_top_k: int = Field(validation_alias="STIRLING_RAG_TOP_K")
    rag_max_searches: int = Field(validation_alias="STIRLING_RAG_MAX_SEARCHES")
    documents_reaper_interval_seconds: int = Field(
        default=900,
        validation_alias="STIRLING_DOCUMENTS_REAPER_INTERVAL_SECONDS",
    )

    # Chunked reasoner settings (whole-document map-reduce).
    chunked_reasoner_chars_per_slice: int = Field(validation_alias="STIRLING_CHUNKED_REASONER_CHARS_PER_SLICE")
    chunked_reasoner_concurrency: int = Field(validation_alias="STIRLING_CHUNKED_REASONER_CONCURRENCY")
    chunked_reasoner_worker_timeout_seconds: float = Field(
        validation_alias="STIRLING_CHUNKED_REASONER_WORKER_TIMEOUT_SECONDS"
    )
    # Maximum size, in characters, of the rendered notes block before the
    # reasoner folds slice notes hierarchically. The Anthropic context limit
    # is 200k tokens (~880k chars); we leave a generous margin for the
    # downstream agent's system prompt, history, tool definitions, and
    # response budget.
    chunked_reasoner_notes_char_budget: int = Field(validation_alias="STIRLING_CHUNKED_REASONER_NOTES_CHAR_BUDGET")

    # Contradiction-agent settings.
    # Concurrency cap for per-bucket pair detection (stage 4). Independent from
    # the chunked-reasoner pool so claim extraction and pair detection don't
    # starve each other when both fire in the same request.
    contradiction_detect_concurrency: int = Field(
        default=5,
        validation_alias="STIRLING_CONTRADICTION_DETECT_CONCURRENCY",
    )
    # Window size for splitting oversized claim buckets fed to the detector.
    # Buckets with more than this many claims are sliced into overlapping
    # windows so no claim is silently dropped from contradiction detection.
    contradiction_bucket_chunk_size: int = Field(
        default=12,
        validation_alias="STIRLING_CONTRADICTION_BUCKET_CHUNK_SIZE",
    )
    # Overlap between adjacent bucket-detection windows so claims at the
    # boundary are still paired with their neighbours.
    contradiction_bucket_chunk_overlap: int = Field(
        default=2,
        validation_alias="STIRLING_CONTRADICTION_BUCKET_CHUNK_OVERLAP",
    )
    # Maximum number of unique subjects passed to a single canonicaliser
    # LLM call. Audits over very long documents can surface thousands of
    # unique subject phrases; batching keeps the per-call prompt size
    # below the model's effective context window.
    contradiction_canonicaliser_batch_size: int = Field(
        default=500,
        validation_alias="STIRLING_CONTRADICTION_CANONICALISER_BATCH_SIZE",
    )

    max_pages: int = Field(validation_alias="STIRLING_MAX_PAGES")
    max_characters: int = Field(validation_alias="STIRLING_MAX_CHARACTERS")

    # When true, API routes reject requests that lack an X-User-Id header at
    # the boundary. Self-hosted deployments with security disabled have no
    # user identity and leave this off; multi-tenant deployments turn it on so
    # user-scoped work is never processed without a tenant attached.
    require_user_id: bool = Field(validation_alias="STIRLING_REQUIRE_USER_ID")

    log_level: str = Field(default="INFO", validation_alias="STIRLING_LOG_LEVEL")
    log_file: str = Field(default="", validation_alias="STIRLING_LOG_FILE")
    # When true, raises httpx + httpcore logger levels so every outgoing
    # model SDK call is logged with timing. Use to diagnose worker stalls:
    # a hung request shows the "Request: POST ..." line with no matching
    # response line, confirming the hang is transport-layer (not in our
    # code or the Anthropic SDK itself). Off by default — DEBUG-level
    # output is high-volume.
    http_debug: bool = Field(default=False, validation_alias="STIRLING_HTTP_DEBUG")

    posthog_enabled: bool = Field(validation_alias="STIRLING_POSTHOG_ENABLED")
    posthog_api_key: str = Field(validation_alias="STIRLING_POSTHOG_API_KEY")
    posthog_host: str = Field(validation_alias="STIRLING_POSTHOG_HOST")

    # Shared secret enforced by EngineSharedSecretMiddleware. Empty disables enforcement
    # unless engine_require_auth is set, in which case the engine fails closed (503).
    engine_shared_secret: str = Field(default="", validation_alias="STIRLING_ENGINE_SHARED_SECRET")
    engine_require_auth: bool = Field(default=False, validation_alias="STIRLING_ENGINE_REQUIRE_AUTH")


def _configure_logging(level_name: str, log_file: str, http_debug: bool) -> None:
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

    if http_debug:
        _enable_http_debug(formatter)


def _enable_http_debug(formatter: logging.Formatter) -> None:
    """Surface every httpx/httpcore call against the Anthropic API.

    httpx emits one INFO line per request with the URL and final status,
    which is the most useful signal for diagnosing hung worker calls: a
    successful call shows "Request" then "Response" within a second or two;
    a hung one shows "Request" with no matching response until it's
    cancelled. httpcore at DEBUG drills down to TCP / HTTP/2 stream events
    if the user wants to see exactly where bytes stop flowing.

    The ``stirling`` console handler is scoped to its own logger tree, so
    we attach a dedicated stream handler here. Without it, httpx records
    propagate to the root logger which has no handler in our setup and the
    output is silently dropped.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)
    handler.setLevel(logging.DEBUG)

    for name, level in (("httpx", logging.INFO), ("httpcore", logging.DEBUG)):
        lg = logging.getLogger(name)
        lg.setLevel(level)
        # Idempotent: avoid stacking handlers on settings reload.
        if not any(getattr(h, "_stirling_http_debug", False) for h in lg.handlers):
            handler._stirling_http_debug = True  # type: ignore[attr-defined]
            lg.addHandler(handler)
        lg.propagate = False


@lru_cache(maxsize=1)
def load_settings() -> AppSettings:
    load_dotenv(ENV_FILE)
    load_dotenv(ENV_LOCAL_FILE, override=True)
    settings = AppSettings.model_validate({})
    _configure_logging(settings.log_level, settings.log_file, settings.http_debug)
    return settings
