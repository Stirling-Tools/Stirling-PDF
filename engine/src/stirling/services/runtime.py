from __future__ import annotations

from dataclasses import dataclass

from pydantic_ai.settings import ModelSettings

from stirling.config.settings import AppSettings
from stirling.services.java_client import JavaClient, UnavailableJavaClient
from stirling.services.model_registry import ModelRegistry, RegisteredModel


@dataclass(frozen=True)
class AppRuntime:
    settings: AppSettings
    model_registry: ModelRegistry
    java_client: JavaClient

    def fast_model_settings(self) -> ModelSettings:
        return build_model_settings(self.model_registry.fast)

    def smart_model_settings(self) -> ModelSettings:
        return build_model_settings(self.model_registry.smart)


def build_model_settings(registered_model: RegisteredModel) -> ModelSettings:
    model_settings: ModelSettings = {}
    if registered_model.max_tokens is not None:
        model_settings["max_tokens"] = registered_model.max_tokens
    return model_settings


def build_runtime(settings: AppSettings) -> AppRuntime:
    model_registry = ModelRegistry.from_settings(settings)
    return AppRuntime(
        settings=settings,
        model_registry=model_registry,
        java_client=UnavailableJavaClient(),
    )
