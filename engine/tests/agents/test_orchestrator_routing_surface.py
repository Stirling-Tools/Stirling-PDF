"""Offline guards over the router's two hand-maintained surfaces.

Routing *quality* needs a live model, but routing *wiring* does not, and the wiring is
where the likely bug is: the capability list is typed out twice in one file - once as
``ToolOutput`` delegates for hosted providers, once as the ``_RouteCapability`` Literal
plus a ``match`` for ollama/custom - with nothing linking them. Add a capability to one
surface only and it is silently unreachable on every deployment using the other, while
the whole suite stays green.

These tests never call a model.
"""

from __future__ import annotations

import typing
from unittest.mock import AsyncMock, patch

import pytest

from stirling.agents.orchestrator import _ROUTER_SYSTEM_PROMPT, OrchestratorAgent, _RouteCapability, _RouteDecision
from stirling.config import AppSettings
from stirling.contracts import OrchestratorRequest, UnsupportedCapabilityResponse
from stirling.services import build_runtime
from stirling.services.runtime import AppRuntime

# "unsupported" is answered in the orchestrator itself rather than by a delegate, so it is
# the one capability with no `delegate_`/`_run_` pair.
_TERMINAL = "unsupported"

# The router names one capability differently from the method that serves it: the enum says
# "user_spec" while the internal pair is agent_draft, matching SupportedCapability.AGENT_DRAFT.
_RUN_METHOD = {"user_spec": "agent_draft"}

_CAPABILITIES = set(typing.get_args(_RouteCapability))


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
def ollama_runtime(app_settings: AppSettings) -> AppRuntime:
    """The enum-router path only runs for ollama/custom, so nothing else exercises it."""
    return build_runtime(app_settings.model_copy(update={"chat_provider": "ollama"}))


def _tool_router_prompt(runtime: AppRuntime) -> str:
    """The hosted-path prompt, read back off the constructed agent."""
    prompts = OrchestratorAgent(runtime).agent._system_prompts
    assert prompts, "pydantic-ai no longer exposes the composed system prompt"
    return "\n".join(prompts)


class _StubRun:
    def __init__(self, capability: str, message: str | None = None) -> None:
        self.output = _RouteDecision(capability=capability, message=message)  # type: ignore[arg-type]


def _registered_output_tools(runtime: AppRuntime) -> set[str]:
    """The output-tool names actually shipped to a hosted model.

    Reading method names off the class is not enough: a delegate method can exist, be named in
    both prompts, have a match arm, and still never be registered in ``output_type=[...]``, in
    which case hosted providers can never reach it and every name-based check still passes.
    """
    toolset = OrchestratorAgent(runtime).agent._output_schema.toolset
    assert toolset is not None, "the orchestrator no longer delivers its output via tools"
    return set(toolset.processors.keys())


def test_registered_output_tools_match_the_enum(runtime: AppRuntime) -> None:
    expected = {f"delegate_{c}" for c in _CAPABILITIES - {_TERMINAL}} | {"unsupported_capability"}
    assert _registered_output_tools(runtime) == expected, (
        "the ToolOutput registration and the _RouteCapability Literal have drifted; a capability "
        "missing here is unreachable on every hosted provider even though the enum path serves it"
    )


def test_every_enum_capability_has_a_delegate() -> None:
    for capability in _CAPABILITIES - {_TERMINAL}:
        assert hasattr(OrchestratorAgent, f"delegate_{capability}"), (
            f"_RouteCapability names {capability!r} but OrchestratorAgent has no delegate_{capability}; "
            "hosted providers cannot route to it"
        )


def test_every_delegate_has_an_enum_capability() -> None:
    delegates = {name[len("delegate_") :] for name in vars(OrchestratorAgent) if name.startswith("delegate_")}
    assert delegates == _CAPABILITIES - {_TERMINAL}, (
        "the ToolOutput delegates and the _RouteCapability Literal have drifted; "
        f"delegates={sorted(delegates)} enum={sorted(_CAPABILITIES - {_TERMINAL})}"
    )


def test_every_capability_is_described_in_the_enum_router_prompt() -> None:
    for capability in _CAPABILITIES:
        assert capability in _ROUTER_SYSTEM_PROMPT, (
            f"{capability!r} is routable but the ollama router prompt never mentions it"
        )


def test_every_capability_is_described_in_the_tool_router_prompt(runtime: AppRuntime) -> None:
    prompt = _tool_router_prompt(runtime)
    for capability in _CAPABILITIES:
        assert capability in prompt, f"{capability!r} is routable but the hosted router prompt never mentions it"


@pytest.mark.anyio
@pytest.mark.parametrize("capability", sorted(_CAPABILITIES - {_TERMINAL}))
async def test_enum_router_dispatches_every_capability(ollama_runtime: AppRuntime, capability: str) -> None:
    """A missing `case` arm would fall through to assert_never at runtime, which no
    type checker catches for a value that arrives as data from a model."""
    orchestrator = OrchestratorAgent(ollama_runtime)
    assert orchestrator._router is not None, "ollama must take the enum-routing path"

    sentinel = object()
    run_method = f"_run_{_RUN_METHOD.get(capability, capability)}"
    with patch.object(orchestrator._router, "run", AsyncMock(return_value=_StubRun(capability))):
        with patch.object(orchestrator, run_method, AsyncMock(return_value=sentinel)):
            result = await orchestrator.handle(OrchestratorRequest(user_message="anything"))

    assert result is sentinel


@pytest.mark.anyio
async def test_enum_router_unsupported_returns_the_models_message(ollama_runtime: AppRuntime) -> None:
    orchestrator = OrchestratorAgent(ollama_runtime)
    assert orchestrator._router is not None
    with patch.object(orchestrator._router, "run", AsyncMock(return_value=_StubRun(_TERMINAL, "no can do"))):
        result = await orchestrator.handle(OrchestratorRequest(user_message="anything"))

    assert isinstance(result, UnsupportedCapabilityResponse)
    assert result.message == "no can do"


def test_router_prompts_no_longer_split_on_whether_a_file_is_attached(runtime: AppRuntime) -> None:
    """pdf_create used to be defined as 'no input file', which made it the magnet for every
    file-less question - including 'how do I configure SSO?'. Both surfaces must cut on intent."""
    for prompt in (_ROUTER_SYSTEM_PROMPT, _tool_router_prompt(runtime)):
        assert "no input file" not in prompt


def test_both_router_prompts_route_product_questions_to_pdf_question(runtime: AppRuntime) -> None:
    for prompt in (_ROUTER_SYSTEM_PROMPT, _tool_router_prompt(runtime)):
        assert "Stirling PDF itself" in prompt
