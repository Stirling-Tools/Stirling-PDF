from __future__ import annotations

from pydantic import ConfigDict, Field

from stirling.models import ApiModel

# Tolerate unknown fields so a newer processor pushing an unknown field is ignored rather
# than rejecting the whole push. Overrides only the extra policy; camelCase aliasing is inherited.
_TOLERANT = ConfigDict(extra="ignore")


class ConfigModelsSection(ApiModel):
    """Model provider + credentials pushed by the Java processor; empty fields mean "keep the engine's env value"."""

    model_config = _TOLERANT

    provider: str = ""
    smart_model: str = ""
    fast_model: str = ""
    smart_max_tokens: int | None = Field(default=None, ge=1)
    fast_max_tokens: int | None = Field(default=None, ge=1)
    api_key: str = ""
    base_url: str = ""


class ConfigRagSection(ApiModel):
    model_config = _TOLERANT

    embedding_provider: str = ""
    embedding_model: str = ""
    embedding_api_key: str = ""
    # OpenAI-compatible endpoint URL for ollama/custom embedding providers; empty keeps the env value.
    embedding_base_url: str = ""
    top_k: int | None = Field(default=None, ge=1)
    # 0 is a legitimate "no retrieval searches" setting, so this floors at 0 not 1.
    max_searches: int | None = Field(default=None, ge=0)


class ConfigLimitsSection(ApiModel):
    model_config = _TOLERANT

    max_pages: int | None = Field(default=None, ge=1)
    max_characters: int | None = Field(default=None, ge=1)
    # Must be >= 1: it becomes an asyncio.Semaphore bound, and 0 constructs a permanently locked
    # semaphore that hangs every model call; the push is persisted so a restart won't clear it.
    model_max_concurrency: int | None = Field(default=None, ge=1)


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
