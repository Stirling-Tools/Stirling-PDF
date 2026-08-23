"""VoyageAI embeddings over its OpenAI-shaped REST API, without the `voyageai` SDK.

The SDK imports PIL, langchain-text-splitters, numpy and tokenizers at module scope
to support multimodal embeddings, its own chunking helper and a local inference
backend - none of which the engine uses, since it chunks via
:mod:`stirling.documents.chunker`. That import chain costs ~207MB in the image.

Voyage's `/v1/embeddings` endpoint takes `Authorization: Bearer <key>` and returns
the same `{data: [{embedding, index}], model, usage}` body as OpenAI, so the openai
client speaks it directly. The one field OpenAI has no equivalent for is
`input_type`, which Voyage uses to optimise query embeddings differently from
document embeddings; it is forwarded here.
"""

from __future__ import annotations

import os
from collections.abc import Sequence

from pydantic_ai.embeddings import EmbeddingResult, EmbeddingSettings
from pydantic_ai.embeddings.openai import OpenAIEmbeddingModel
from pydantic_ai.embeddings.result import EmbedInputType
from pydantic_ai.providers.openai import OpenAIProvider

VOYAGE_BASE_URL = "https://api.voyageai.com/v1"
VOYAGE_API_KEY_ENV = "VOYAGE_API_KEY"

# Stands in for an unset key so a keyless engine still boots, as it did when the SDK
# resolved credentials lazily. Passing it explicitly also stops the OpenAI client
# falling back to OPENAI_API_KEY and sending that key to Voyage.
_MISSING_API_KEY = "stirling-voyage-api-key-not-configured"


class VoyageEmbeddingModel(OpenAIEmbeddingModel):
    """Voyage embeddings spoken over the OpenAI wire format."""

    async def embed(
        self,
        inputs: str | Sequence[str],
        *,
        input_type: EmbedInputType,
        settings: EmbeddingSettings | None = None,
    ) -> EmbeddingResult:
        """Embed `inputs`, forwarding Voyage's `input_type` that the OpenAI model drops."""
        if self._client.api_key == _MISSING_API_KEY:
            raise ValueError(
                f"VoyageAI embeddings need an API key: set {VOYAGE_API_KEY_ENV} or push one via admin AI settings."
            )
        merged: dict = dict(settings or {})
        extra_body = dict(merged.get("extra_body") or {})
        extra_body.setdefault("input_type", input_type)
        merged["extra_body"] = extra_body
        return await super().embed(inputs, input_type=input_type, settings=merged)  # type: ignore[arg-type]


def build_voyage_model(
    model_name: str,
    *,
    api_key: str | None = None,
    base_url: str | None = None,
) -> VoyageEmbeddingModel:
    """Build a Voyage embedding model; a missing key only fails once an embed is attempted."""
    key = api_key or os.environ.get(VOYAGE_API_KEY_ENV) or _MISSING_API_KEY
    provider = OpenAIProvider(base_url=base_url or VOYAGE_BASE_URL, api_key=key)
    return VoyageEmbeddingModel(model_name, provider=provider)
