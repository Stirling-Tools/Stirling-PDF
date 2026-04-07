from __future__ import annotations

from posthog.ai.anthropic import AsyncAnthropic as PostHogAnthropic
from posthog.ai.openai import AsyncOpenAI as PostHogOpenAI
from posthog.client import Client as PostHogClient
from pydantic_ai.models import Model, infer_model, parse_model_id
from pydantic_ai.providers.anthropic import AnthropicProvider
from pydantic_ai.providers.openai import OpenAIProvider

from stirling.config import AppSettings


def build_posthog_client(settings: AppSettings) -> PostHogClient | None:
    """Create a PostHog client if tracking is enabled, otherwise return None."""
    if not settings.posthog_enabled or not settings.posthog_api_key:
        return None
    return PostHogClient(project_api_key=settings.posthog_api_key, host=settings.posthog_host)


def build_tracked_model(model_name: str, ph_client: PostHogClient | None) -> Model:
    """Build a Pydantic AI model, wrapping the underlying SDK client with PostHog tracking when possible.

    Supports Anthropic and OpenAI providers. For other providers, falls back to the default
    ``infer_model`` behaviour with no tracking.
    """
    if ph_client is None:
        return infer_model(model_name)

    provider_name, _ = parse_model_id(model_name)

    if provider_name == "anthropic":
        wrapped_client = PostHogAnthropic(posthog_client=ph_client)
        provider = AnthropicProvider(anthropic_client=wrapped_client)
        return infer_model(model_name, provider_factory=lambda _: provider)

    elif provider_name == "openai":
        wrapped_client = PostHogOpenAI(posthog_client=ph_client)
        provider = OpenAIProvider(openai_client=wrapped_client)
        return infer_model(model_name, provider_factory=lambda _: provider)

    else:
        return infer_model(model_name)


def shutdown_posthog_client(ph_client: PostHogClient | None) -> None:
    """Flush and shut down the PostHog client if it exists."""
    if ph_client is not None:
        ph_client.shutdown()
