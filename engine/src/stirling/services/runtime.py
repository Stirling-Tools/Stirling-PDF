from __future__ import annotations

from dataclasses import dataclass

from pydantic_ai.models import Model, infer_model
from pydantic_ai.settings import ModelSettings

from stirling.config import AppSettings


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


def build_runtime(settings: AppSettings) -> AppRuntime:
    return AppRuntime(
        settings=settings,
        fast_model=infer_model(settings.fast_model_name),
        smart_model=infer_model(settings.smart_model_name),
    )
