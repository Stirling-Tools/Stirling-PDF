from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from pydantic import BaseModel

from stirling.contracts.progress import ProgressEvent, WholeDocReadDone
from stirling.documents import embedder
from stirling.logging import Pretty
from stirling.services import progress


class DemoModel(BaseModel):
    value: int


def test_pretty_formats_models_and_non_models() -> None:
    assert '"value": 3' in str(Pretty(DemoModel(value=3)))
    assert '"value": 3' in str(Pretty({"value": 3}))
    assert "2026" in str(Pretty({"date": object()})) or "object" in str(Pretty({"date": object()}))


@pytest.mark.parametrize(
    ("provider", "api_key", "base_url"),
    [(None, None, None), ("voyageai", "key", None), ("openai", "key", None), ("ollama", None, "http://localhost")],
)
def test_build_embedder_supports_configured_provider_paths(
    provider: str | None, api_key: str | None, base_url: str | None
) -> None:
    result = embedder._build_embedder("test-model", provider=provider, api_key=api_key, base_url=base_url)
    assert result is not None


def test_build_embedder_rejects_unknown_provider() -> None:
    with pytest.raises(ValueError, match="Unsupported"):
        embedder._build_embedder("test-model", provider="unknown", api_key="key")


@pytest.mark.anyio
async def test_embedding_service_batches_queries_and_prepares_documents(monkeypatch: pytest.MonkeyPatch) -> None:
    class FakeEmbedder:
        async def embed_query(self, _text: str) -> SimpleNamespace:
            return SimpleNamespace(embeddings=[[1, 2]])

        async def embed_documents(self, texts: list[str]) -> SimpleNamespace:
            return SimpleNamespace(embeddings=[[float(len(text))] for text in texts])

    service = embedder.EmbeddingService.__new__(embedder.EmbeddingService)
    object.__setattr__(service, "_embedder", FakeEmbedder())
    service._chunk_size = 3
    service._chunk_overlap = 0
    service._embed_batch_size = 2

    assert await service.embed_query("query") == [1, 2]
    assert await service.embed_documents([]) == []
    assert await service.embed_documents(["a", "bb", "ccc"]) == [[1.0], [2.0], [3.0]]
    documents = service.chunk_and_prepare("abcdef", "source.pdf", {"kind": "test"})
    assert documents[0].metadata == {"kind": "test", "source": "source.pdf", "chunk_index": "0"}


@pytest.mark.anyio
async def test_progress_emitter_is_optional_and_failures_are_swallowed() -> None:
    event = WholeDocReadDone(completed=1, slices=1, duration_seconds=0.1)
    await progress.emit_progress(event)

    seen: list[ProgressEvent] = []

    async def emit(value: ProgressEvent) -> None:
        seen.append(value)

    token = progress.set_progress_emitter(emit)
    try:
        await progress.emit_progress(event)
    finally:
        progress.reset_progress_emitter(token)
    assert seen == [event]

    async def fail(_value: ProgressEvent) -> None:
        raise RuntimeError("ignored")

    token = progress.set_progress_emitter(fail)
    try:
        await progress.emit_progress(event)
    finally:
        progress.reset_progress_emitter(token)

    async def cancel(_value: ProgressEvent) -> None:
        raise asyncio.CancelledError

    token = progress.set_progress_emitter(cancel)
    try:
        with pytest.raises(asyncio.CancelledError):
            await progress.emit_progress(event)
    finally:
        progress.reset_progress_emitter(token)
