from __future__ import annotations

from stirling.config.settings import AppSettings, ModelProvider
from stirling.models.base import ApiModel


class RegisteredModel(ApiModel):
    name: str
    provider: ModelProvider
    max_tokens: int | None = None
    reasoning_effort: str | None = None
    text_verbosity: str | None = None


class ModelRegistry(ApiModel):
    smart: RegisteredModel
    fast: RegisteredModel

    @classmethod
    def from_settings(cls, settings: AppSettings) -> ModelRegistry:
        return cls(
            smart=RegisteredModel(
                name=settings.smart_model.name,
                provider=settings.smart_model.provider,
                max_tokens=settings.smart_model.max_tokens,
                reasoning_effort=settings.smart_model.reasoning_effort,
                text_verbosity=settings.smart_model.text_verbosity,
            ),
            fast=RegisteredModel(
                name=settings.fast_model.name,
                provider=settings.fast_model.provider,
                max_tokens=settings.fast_model.max_tokens,
                reasoning_effort=settings.fast_model.reasoning_effort,
                text_verbosity=settings.fast_model.text_verbosity,
            ),
        )
