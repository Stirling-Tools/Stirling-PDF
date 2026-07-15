from __future__ import annotations

from pydantic import ConfigDict, Field

from stirling.models import ApiModel

# Tolerate unknown fields so a newer processor pushing a field this engine version
# doesn't know is ignored rather than rejecting the whole push. Overrides only the
# ``extra`` policy from ApiModel; the camelCase alias generator is inherited.
_TOLERANT = ConfigDict(extra="ignore")


class ConfigModelsSection(ApiModel):
    """Model provider + credentials pushed by the Java processor.

    Field names on the wire are camelCase (``smartModel`` etc.) via the
    :class:`ApiModel` alias generator. Empty ``provider``/``apiKey``/``baseUrl``
    or empty model names mean "keep the engine's env-configured value".
    """

    model_config = _TOLERANT

    provider: str = ""
    smart_model: str = ""
    fast_model: str = ""
    smart_max_tokens: int | None = None
    fast_max_tokens: int | None = None
    api_key: str = ""
    base_url: str = ""


class ConfigRagSection(ApiModel):
    model_config = _TOLERANT

    embedding_provider: str = ""
    embedding_model: str = ""
    embedding_api_key: str = ""
    # OpenAI-compatible endpoint URL for ollama/custom embedding providers.
    # Empty keeps the engine's env value, same convention as the other fields.
    embedding_base_url: str = ""
    top_k: int | None = None
    max_searches: int | None = None


class ConfigLimitsSection(ApiModel):
    model_config = _TOLERANT

    max_pages: int | None = None
    max_characters: int | None = None
    model_max_concurrency: int | None = None


class ConfigPushRequest(ApiModel):
    """Admin-configured AI settings pushed at processor startup."""

    model_config = _TOLERANT

    models: ConfigModelsSection = Field(default_factory=ConfigModelsSection)
    rag: ConfigRagSection = Field(default_factory=ConfigRagSection)
    limits: ConfigLimitsSection = Field(default_factory=ConfigLimitsSection)


class ConfigApplyResponse(ApiModel):
    """Summary of the effective config after a push. Never echoes credentials."""

    status: str
    provider: str
    smart_model: str
    fast_model: str
    smart_max_tokens: int
    fast_max_tokens: int
    rag_embedding_model: str
    rag_top_k: int
    rag_max_searches: int
    max_pages: int
    max_characters: int
    model_max_concurrency: int
    notes: list[str] = Field(default_factory=list)
