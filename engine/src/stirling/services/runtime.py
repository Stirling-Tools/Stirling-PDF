from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from pydantic_ai.models import Model, infer_model
from pydantic_ai.settings import ModelSettings

from stirling.config import ENGINE_ROOT, AppSettings
from stirling.rag.capability import RagCapability
from stirling.rag.embedder import EmbeddingService
from stirling.rag.pgvector_store import PgVectorStore
from stirling.rag.service import RagService
from stirling.rag.sqlite_vec_store import SqliteVecStore
from stirling.rag.store import VectorStore

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AppRuntime:
    settings: AppSettings
    fast_model: Model
    smart_model: Model
    rag_service: RagService | None
    rag_capability: RagCapability | None

    @property
    def fast_model_settings(self) -> ModelSettings:
        return build_model_settings(self.settings.fast_model_max_tokens)

    @property
    def smart_model_settings(self) -> ModelSettings:
        return build_model_settings(self.settings.smart_model_max_tokens)


def build_model_settings(max_tokens: int | None) -> ModelSettings:
    model_settings: ModelSettings = {}
    if max_tokens is not None:
        model_settings["max_tokens"] = max_tokens
    return model_settings


def validate_structured_output_support(model: Model, model_name: str) -> None:
    # Pydantic AI's dedicated test model does not advertise native structured output,
    # but we still use it in unit tests as a non-production stand-in.
    if model_name == "test":
        return
    if not model.profile.supports_json_schema_output:
        raise ValueError(f"Unsupported model {model_name}. This model does not support structured outputs.")


def _build_vector_store(settings: AppSettings) -> VectorStore:
    """Build the configured vector store backend."""
    backend = settings.rag_backend.lower()
    if backend == "sqlite":
        store_path = Path(settings.rag_store_path)
        if not store_path.is_absolute():
            store_path = ENGINE_ROOT / store_path
        logger.info("RAG backend=sqlite, db_path=%s", store_path)
        return SqliteVecStore(db_path=store_path)
    if backend == "pgvector":
        logger.info("RAG backend=pgvector, dsn=<configured>")
        return PgVectorStore(dsn=settings.rag_pgvector_dsn)
    raise ValueError(f"Unknown rag_backend {settings.rag_backend!r}. Expected 'sqlite' or 'pgvector'.")


def _build_rag(settings: AppSettings) -> tuple[RagService | None, RagCapability | None]:
    """Build the RAG service and capability if RAG is enabled."""
    if not settings.rag_enabled:
        logger.info("RAG is disabled")
        return None, None

    logger.info("RAG enabled: embedding_model=%s", settings.rag_embedding_model)

    embedder = EmbeddingService(
        model_name=settings.rag_embedding_model,
        chunk_size=settings.rag_chunk_size,
        chunk_overlap=settings.rag_chunk_overlap,
    )
    store = _build_vector_store(settings)
    service = RagService(embedder=embedder, store=store, default_top_k=settings.rag_default_top_k)
    capability = RagCapability(rag_service=service, top_k=settings.rag_default_top_k)
    return service, capability


def build_runtime(settings: AppSettings) -> AppRuntime:
    fast_model = infer_model(settings.fast_model_name)
    smart_model = infer_model(settings.smart_model_name)
    validate_structured_output_support(fast_model, settings.fast_model_name)
    validate_structured_output_support(smart_model, settings.smart_model_name)

    rag_service, rag_capability = _build_rag(settings)

    return AppRuntime(
        settings=settings,
        fast_model=fast_model,
        smart_model=smart_model,
        rag_service=rag_service,
        rag_capability=rag_capability,
    )
