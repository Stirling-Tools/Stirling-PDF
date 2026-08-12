from __future__ import annotations

import asyncio

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models import Model, ModelRequestParameters
from pydantic_ai.settings import ModelSettings

from stirling.services.runtime import ConcurrencyLimitedModel


class TrackingModel(Model):
    """Records the high-water mark of concurrent in-flight requests."""

    def __init__(self) -> None:
        super().__init__()
        self.active = 0
        self.max_active = 0

    @property
    def model_name(self) -> str:
        return "tracking"

    @property
    def system(self) -> str:
        return "test"

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        # Yield twice so every gathered task gets a chance to be in flight
        # together before any of them completes.
        await asyncio.sleep(0)
        await asyncio.sleep(0)
        self.active -= 1
        return ModelResponse(parts=[TextPart(content="ok")])


@pytest.mark.anyio
async def test_shared_semaphore_caps_concurrency_across_models() -> None:
    inner = TrackingModel()
    semaphore = asyncio.Semaphore(2)
    fast = ConcurrencyLimitedModel(inner, semaphore)
    smart = ConcurrencyLimitedModel(inner, semaphore)
    params = ModelRequestParameters()

    await asyncio.gather(
        *(fast.request([], None, params) for _ in range(5)),
        *(smart.request([], None, params) for _ in range(5)),
    )

    assert inner.max_active == 2
