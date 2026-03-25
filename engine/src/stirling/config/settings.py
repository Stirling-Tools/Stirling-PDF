from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from stirling.models.base import ApiModel

ENGINE_ROOT = Path(__file__).resolve().parents[3]


class ModelProvider(StrEnum):
    ANTHROPIC = "anthropic"
    OPENAI = "openai"
    UNKNOWN = "unknown"


class ModelSettings(ApiModel):
    name: str
    provider: ModelProvider
    reasoning_effort: str | None = None
    text_verbosity: str | None = None
    max_tokens: int | None = None


class JavaBackendSettings(ApiModel):
    url: str
    api_key: str
    request_timeout_seconds: int


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENGINE_ROOT / ".env", extra="ignore", populate_by_name=True)

    anthropic_api_key: str = Field(validation_alias="STIRLING_ANTHROPIC_API_KEY")
    openai_api_key: str = Field(validation_alias="STIRLING_OPENAI_API_KEY")
    openai_base_url: str | None = Field(default=None, validation_alias="STIRLING_OPENAI_BASE_URL")

    smart_model_name: str = Field(validation_alias="STIRLING_SMART_MODEL")
    fast_model_name: str = Field(validation_alias="STIRLING_FAST_MODEL")
    smart_model_reasoning_effort: str | None = Field(
        default=None, validation_alias="STIRLING_SMART_MODEL_REASONING_EFFORT"
    )
    fast_model_reasoning_effort: str | None = Field(
        default=None, validation_alias="STIRLING_FAST_MODEL_REASONING_EFFORT"
    )
    smart_model_text_verbosity: str | None = Field(default=None, validation_alias="STIRLING_SMART_MODEL_TEXT_VERBOSITY")
    fast_model_text_verbosity: str | None = Field(default=None, validation_alias="STIRLING_FAST_MODEL_TEXT_VERBOSITY")
    ai_max_tokens: int | None = Field(default=None, validation_alias="STIRLING_AI_MAX_TOKENS")
    smart_model_max_tokens: int = Field(validation_alias="STIRLING_SMART_MODEL_MAX_TOKENS")
    fast_model_max_tokens: int = Field(validation_alias="STIRLING_FAST_MODEL_MAX_TOKENS")
    claude_max_tokens: int = Field(validation_alias="STIRLING_CLAUDE_MAX_TOKENS")
    default_model_max_tokens: int = Field(validation_alias="STIRLING_DEFAULT_MODEL_MAX_TOKENS")

    posthog_api_key: str = Field(validation_alias="STIRLING_POSTHOG_API_KEY")
    posthog_host: str = Field(validation_alias="STIRLING_POSTHOG_HOST")

    java_backend_url: str = Field(validation_alias="STIRLING_JAVA_BACKEND_URL")
    java_backend_api_key: str = Field(validation_alias="STIRLING_JAVA_BACKEND_API_KEY")
    java_request_timeout_seconds: int = Field(validation_alias="STIRLING_JAVA_REQUEST_TIMEOUT_SECONDS")

    raw_debug: bool = Field(validation_alias="STIRLING_AI_RAW_DEBUG")
    flask_debug: bool = Field(validation_alias="STIRLING_FLASK_DEBUG")
    log_path: str | None = Field(default=None, validation_alias="STIRLING_LOG_PATH")
    pdf_editor_table_debug: bool = Field(validation_alias="STIRLING_PDF_EDITOR_TABLE_DEBUG")
    pdf_tauri_mode: bool = Field(validation_alias="STIRLING_PDF_TAURI_MODE")

    ai_streaming: bool = Field(validation_alias="STIRLING_AI_STREAMING")
    ai_preview_max_inflight: int = Field(validation_alias="STIRLING_AI_PREVIEW_MAX_INFLIGHT")
    ai_request_timeout: int = Field(validation_alias="STIRLING_AI_REQUEST_TIMEOUT")

    @field_validator(
        "openai_base_url",
        "smart_model_reasoning_effort",
        "fast_model_reasoning_effort",
        "smart_model_text_verbosity",
        "fast_model_text_verbosity",
        "ai_max_tokens",
        "log_path",
        mode="before",
    )
    @classmethod
    def blank_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def resolved_log_path(self) -> Path | None:
        return Path(self.log_path).expanduser() if self.log_path else None

    @property
    def java_backend(self) -> JavaBackendSettings:
        return JavaBackendSettings(
            url=self.java_backend_url,
            api_key=self.java_backend_api_key,
            request_timeout_seconds=self.java_request_timeout_seconds,
        )

    @property
    def smart_model(self) -> ModelSettings:
        return ModelSettings(
            name=self.smart_model_name,
            provider=_infer_provider(self.smart_model_name),
            reasoning_effort=self.smart_model_reasoning_effort,
            text_verbosity=self.smart_model_text_verbosity,
            max_tokens=self.ai_max_tokens or self.smart_model_max_tokens,
        )

    @property
    def fast_model(self) -> ModelSettings:
        return ModelSettings(
            name=self.fast_model_name,
            provider=_infer_provider(self.fast_model_name),
            reasoning_effort=self.fast_model_reasoning_effort,
            text_verbosity=self.fast_model_text_verbosity,
            max_tokens=self.ai_max_tokens or self.fast_model_max_tokens,
        )


def _infer_provider(model_name: str) -> ModelProvider:
    normalized_name = model_name.lower()
    if normalized_name.startswith(("gpt", "o1", "o3", "o4")):
        return ModelProvider.OPENAI
    if normalized_name.startswith(("claude", "anthropic")):
        return ModelProvider.ANTHROPIC
    return ModelProvider.UNKNOWN


@lru_cache(maxsize=1)
def load_settings() -> AppSettings:
    return AppSettings.model_validate({})
