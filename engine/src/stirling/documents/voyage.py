"""VoyageAI embeddings over its OpenAI-shaped REST API.

The `voyageai` SDK pulls PIL, numpy, tokenizers and langchain at import for multimodal,
chunking and local-inference features the engine never uses (~207MB).
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

# Keeps a keyless engine bootable, and stops the client falling back to OPENAI_API_KEY.
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
        merged: EmbeddingSettings = {**(settings or {})}
        # extra_body is declared `object`, so narrow rather than assume a mapping.
        current = merged.get("extra_body")
        extra_body: dict[str, object] = dict(current) if isinstance(current, dict) else {}
        extra_body.setdefault("input_type", input_type)
        merged["extra_body"] = extra_body
        return await super().embed(inputs, input_type=input_type, settings=merged)


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
