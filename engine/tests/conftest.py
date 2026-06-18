from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from stirling.config import AppSettings, DocumentsBackend, load_settings
from stirling.services import build_runtime
from stirling.services.runtime import AppRuntime


@pytest.fixture(autouse=True)
def clear_settings_cache() -> Iterator[None]:
    load_settings.cache_clear()
    yield
    load_settings.cache_clear()


def build_app_settings() -> AppSettings:
    return AppSettings(
        smart_model_name="test",
        fast_model_name="test",
        smart_model_max_tokens=8192,
        fast_model_max_tokens=2048,
        model_max_concurrency=32,
        documents_backend=DocumentsBackend.SQLITE,
        rag_embedding_model="voyageai:voyage-4",
        documents_sqlite_path=Path(":memory:"),
        documents_pgvector_dsn="",
        documents_pgvector_pool_min_size=1,
        documents_pgvector_pool_max_size=10,
        rag_chunk_size=512,
        rag_chunk_overlap=64,
        rag_default_top_k=5,
        rag_max_searches=5,
        chunked_reasoner_chars_per_slice=16_000,
        chunked_reasoner_concurrency=10,
        chunked_reasoner_notes_char_budget=250_000,
        chunked_reasoner_worker_timeout_seconds=60.0,
        contradiction_detect_concurrency=5,
        contradiction_bucket_chunk_size=12,
        contradiction_bucket_chunk_overlap=2,
        contradiction_canonicaliser_batch_size=500,
        max_pages=200,
        max_characters=200_000,
        require_user_id=False,
        posthog_enabled=False,
        posthog_api_key="",
        posthog_host="https://eu.i.posthog.com",
    )


@pytest.fixture
def app_settings() -> AppSettings:
    return build_app_settings()


@pytest.fixture
def runtime(app_settings: AppSettings) -> AppRuntime:
    return build_runtime(app_settings)
