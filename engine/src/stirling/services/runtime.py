from __future__ import annotations

from dataclasses import dataclass

from posthog.client import Client as PostHogClient
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings

from stirling.config import AppSettings
from stirling.services.tracking import build_tracked_model


@dataclass(frozen=True)
class AppRuntime:
    settings: AppSettings
    fast_model: Model
    smart_model: Model

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


def build_runtime(settings: AppSettings, ph_client: PostHogClient | None = None) -> AppRuntime:
    fast_model = build_tracked_model(settings.fast_model_name, ph_client)
    smart_model = build_tracked_model(settings.smart_model_name, ph_client)
    validate_structured_output_support(fast_model, settings.fast_model_name)
    validate_structured_output_support(smart_model, settings.smart_model_name)
    return AppRuntime(
        settings=settings,
        fast_model=fast_model,
        smart_model=smart_model,
    )
