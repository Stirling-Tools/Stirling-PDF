from __future__ import annotations

from dataclasses import dataclass

from stirling.config.settings import AppSettings
from stirling.services.ai_client import AiClient, UnavailableAiClient
from stirling.services.java_client import JavaClient, UnavailableJavaClient
from stirling.services.model_registry import ModelRegistry


@dataclass(frozen=True)
class AppRuntime:
    settings: AppSettings
    model_registry: ModelRegistry
    ai_client: AiClient
    java_client: JavaClient


def build_runtime(settings: AppSettings) -> AppRuntime:
    return AppRuntime(
        settings=settings,
        model_registry=ModelRegistry.from_settings(settings),
        ai_client=UnavailableAiClient(),
        java_client=UnavailableJavaClient(),
    )
