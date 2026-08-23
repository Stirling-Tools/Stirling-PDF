from __future__ import annotations

import json
import math
import os
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import httpx
import pytest
from pydantic_ai import Embedder
from pydantic_ai.providers.openai import OpenAIProvider

from stirling.documents.embedder import _build_embedder
from stirling.documents.voyage import VOYAGE_BASE_URL, VoyageEmbeddingModel, build_voyage_model

# Voyage's documented /v1/embeddings response body; identical in shape to OpenAI's,
# except that `usage` carries only total_tokens.
VOYAGE_RESPONSE = {
    "object": "list",
    "data": [
        {"object": "embedding", "embedding": [0.1, 0.2, 0.3], "index": 0},
        {"object": "embedding", "embedding": [0.4, 0.5, 0.6], "index": 1},
    ],
    "model": "voyage-4",
    "usage": {"total_tokens": 7},
}


@dataclass
class SentRequest:
    """One captured outbound embeddings call."""

    url: str
    auth: str | None
    body: dict[str, Any]


def _recording_model(sent: list[SentRequest]) -> VoyageEmbeddingModel:
    """A Voyage model whose HTTP calls are captured instead of sent."""

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(
            SentRequest(
                url=str(request.url),
                auth=request.headers.get("authorization"),
                body=json.loads(request.content),
            )
        )
        return httpx.Response(200, json=VOYAGE_RESPONSE)

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OpenAIProvider(base_url=VOYAGE_BASE_URL, api_key="pa-test-key", http_client=client)
    return VoyageEmbeddingModel("voyage-4", provider=provider)


@pytest.mark.anyio
async def test_posts_to_voyage_embeddings_endpoint_with_bearer_auth() -> None:
    sent: list[SentRequest] = []
    await Embedder(_recording_model(sent)).embed_documents(["alpha", "beta"])

    assert sent[0].url == f"{VOYAGE_BASE_URL}/embeddings"
    assert sent[0].auth == "Bearer pa-test-key"
    assert sent[0].body["model"] == "voyage-4"
    assert sent[0].body["input"] == ["alpha", "beta"]


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("call", "expected"),
    [("embed_query", "query"), ("embed_documents", "document")],
)
async def test_forwards_voyage_input_type(call: str, expected: str) -> None:
    """Voyage embeds queries and documents differently; the stock OpenAI model drops this field."""
    sent: list[SentRequest] = []
    embedder = Embedder(_recording_model(sent))
    await getattr(embedder, call)(["text"])

    assert sent[0].body["input_type"] == expected


@pytest.mark.anyio
async def test_caller_settings_win_over_the_default_input_type() -> None:
    sent: list[SentRequest] = []
    await Embedder(_recording_model(sent)).embed_documents(
        ["text"], settings={"extra_body": {"input_type": "query", "output_dimension": 512}}
    )

    assert sent[0].body["input_type"] == "query"
    assert sent[0].body["output_dimension"] == 512


@pytest.mark.anyio
async def test_parses_voyage_response_into_embeddings() -> None:
    result = await Embedder(_recording_model([])).embed_documents(["alpha", "beta"])

    assert result.embeddings == [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]]


def test_build_voyage_model_reads_the_api_key_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VOYAGE_API_KEY", "pa-env-key")

    assert build_voyage_model("voyage-4").model_name == "voyage-4"


def test_build_voyage_model_without_a_key_still_constructs(monkeypatch: pytest.MonkeyPatch) -> None:
    """A keyless engine has to boot; the SDK resolved credentials lazily too."""
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)

    assert build_voyage_model("voyage-4").model_name == "voyage-4"


@pytest.mark.anyio
async def test_embedding_without_a_key_fails_with_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    model = build_voyage_model("voyage-4")

    with pytest.raises(ValueError, match="VoyageAI embeddings need an API key"):
        await Embedder(model).embed_documents(["text"])


@pytest.mark.anyio
async def test_an_openai_key_is_never_sent_to_voyage(monkeypatch: pytest.MonkeyPatch) -> None:
    """Without a Voyage key the OpenAI client would otherwise fall back to OPENAI_API_KEY."""
    monkeypatch.delenv("VOYAGE_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-openai-secret")
    model = build_voyage_model("voyage-4")

    with pytest.raises(ValueError, match="VoyageAI embeddings need an API key"):
        await Embedder(model).embed_documents(["text"])


def test_env_form_routes_voyageai_through_the_adapter(monkeypatch: pytest.MonkeyPatch) -> None:
    """`STIRLING_RAG_EMBEDDING_MODEL=voyageai:voyage-4` must not need the voyageai SDK."""
    monkeypatch.setenv("VOYAGE_API_KEY", "pa-env-key")

    embedder = _build_embedder("voyageai:voyage-4")

    assert isinstance(embedder.model, VoyageEmbeddingModel)
    assert embedder.model.model_name == "voyage-4"


def test_config_push_form_routes_voyageai_through_the_adapter() -> None:
    embedder = _build_embedder("voyage-4", provider="voyageai", api_key="pa-pushed-key")

    assert isinstance(embedder.model, VoyageEmbeddingModel)


def test_the_voyageai_sdk_is_not_installed() -> None:
    """Guards the ~207MB the SDK's PIL/numpy/tokenizers/langchain import chain would add back."""
    with pytest.raises(ImportError):
        __import__("voyageai")


# Live API checks. Skipped unless VOYAGE_API_KEY is set, so CI stays offline; these
# cover the one thing a mock cannot: that Voyage really accepts what we send.
live_only = pytest.mark.skipif(
    not os.environ.get("VOYAGE_API_KEY"),
    reason="set VOYAGE_API_KEY to run the live VoyageAI checks",
)


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)))


@live_only
@pytest.mark.anyio
async def test_live_voyage_returns_usable_embeddings() -> None:
    result = await Embedder(build_voyage_model("voyage-4")).embed_documents(["alpha", "beta"])

    assert len(result.embeddings) == 2
    assert len(result.embeddings[0]) == 1024


@live_only
@pytest.mark.anyio
async def test_live_voyage_honours_input_type_server_side() -> None:
    """The whole point of forwarding input_type: Voyage embeds the same text differently."""
    embedder = Embedder(build_voyage_model("voyage-4"))
    text = "How do I combine two PDFs?"

    as_query = await embedder.embed_query(text)
    as_document = await embedder.embed_documents([text])

    assert _cosine(as_query.embeddings[0], as_document.embeddings[0]) < 0.999


@live_only
@pytest.mark.anyio
async def test_live_voyage_ranks_the_relevant_document_first() -> None:
    embedder = Embedder(build_voyage_model("voyage-4"))
    docs = await embedder.embed_documents(
        ["Stirling PDF merges and splits PDF files.", "The capital of France is Paris."]
    )
    query = await embedder.embed_query("How do I combine two PDFs?")

    relevant = _cosine(query.embeddings[0], docs.embeddings[0])
    irrelevant = _cosine(query.embeddings[0], docs.embeddings[1])
    assert relevant > irrelevant


@live_only
@pytest.mark.anyio
async def test_live_voyage_accepts_voyage_only_parameters() -> None:
    """extra_body reaches Voyage: output_dimension has no OpenAI equivalent."""
    result = await Embedder(build_voyage_model("voyage-4")).embed_documents(
        ["dimension test"], settings={"extra_body": {"output_dimension": 256}}
    )

    assert len(result.embeddings[0]) == 256
