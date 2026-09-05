"""Routing strategies under test.

``prod_baseline`` reproduces what ships today. Every other strategy is a candidate fix,
implemented so the eval measures the actual change rather than a description of it.
"""

from __future__ import annotations

import json
from collections import Counter
from dataclasses import dataclass
from typing import Protocol

from routing.client import Budget, CallResult, OllamaRouter, enum_schema
from routing.dataset import CAPABILITIES, RoutingCase
from stirling.agents.orchestrator import _ROUTER_SYSTEM_PROMPT
from stirling.contracts import AiFile, ConversationMessage, format_conversation_history, format_file_names

# Production ceiling for the router's tier (engine/.env STIRLING_FAST_MODEL_MAX_TOKENS).
PROD_MAX_TOKENS = 2048
# Headroom for the strategies that deliberately let qwen3 think: measured chains run
# 1,400-2,200 characters, and the cap covers reasoning plus content together.
THINK_MAX_TOKENS = 4096


@dataclass
class StrategyResult:
    predicted: str
    budget: Budget
    detail: str = ""


class Strategy(Protocol):
    name: str
    description: str

    async def route(self, router: OllamaRouter, case: RoutingCase) -> StrategyResult: ...


def build_user_prompt(case: RoutingCase) -> str:
    """The orchestrator's own prompt shape (OrchestratorAgent._build_prompt)."""
    history = format_conversation_history([ConversationMessage(role=r, content=c) for r, c in case.history])
    files = format_file_names([AiFile(id=f"id-{name}", name=name) for name in case.files])
    return (
        f"Conversation history:\n{history}\nUser message: {case.message}\nFiles: {files}\nAvailable artifacts:\n- none"
    )


def _parse_capability(result: CallResult, allowed: list[str]) -> str:
    """Pull the capability out of a constrained-decode response, or report why not."""
    if result.error:
        return "__error__"
    if result.finish_reason == "length":
        # The cap fired mid-generation: pydantic-ai sees invalid output and burns a retry.
        return "__truncated__"
    try:
        parsed = json.loads(result.content)
    except ValueError:
        return "__unparsable__"
    value = parsed.get("capability")
    return value if value in allowed else "__offmenu__"


# Worded differently from every eval case, so the measured gain is generalisation
# rather than memorisation of the test set.
_FEWSHOT = """
Decide by what the user wants BACK, not by which PDF words appear in the message.
- They want an ANSWER, or information read out of the document -> pdf_question.
- They want a CHANGED FILE handed back -> pdf_edit.
- A document merely being mentioned is not a request to act on it.

Examples:
  "How long is the notice period?" -> pdf_question
  "Shorten the notice period to 30 days" -> pdf_edit
  "Is there a table of contents?" -> pdf_question
  "Add a table of contents" -> pdf_edit
  "Does it say anything about encryption?" -> pdf_question
  "Encrypt this file" -> pdf_edit
  "What sections cover the merger?" -> pdf_question
  "Combine these into one file" -> pdf_edit
  "Tell me if the numbers add up" -> pdf_question
  "Put a note on every paragraph that needs work" -> pdf_review
  "Build me a purchase order from scratch" -> pdf_create
  "Make a rule that stamps every upload" -> user_spec
  "Which version of the app is this?" -> unsupported
""".strip()


class _EnumRouter:
    """Single-call enum routing. The knobs are what distinguishes the strategies."""

    def __init__(
        self,
        name: str,
        description: str,
        *,
        thinking: bool,
        temperature: float | None,
        max_tokens: int,
        fewshot: bool = False,
        narrow_by_files: bool = False,
    ) -> None:
        self.name = name
        self.description = description
        self._thinking = thinking
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._fewshot = fewshot
        self._narrow = narrow_by_files

    def _allowed(self, case: RoutingCase) -> list[str]:
        if self._narrow and not case.files:
            # Nothing is attached, so the three capabilities that operate on an input file
            # are impossible. Dropping them from the enum makes them undecodable rather
            # than merely discouraged.
            return ["user_spec", "pdf_create", "unsupported"]
        return list(CAPABILITIES)

    def _system_prompt(self) -> str:
        return f"{_ROUTER_SYSTEM_PROMPT}\n\n{_FEWSHOT}" if self._fewshot else _ROUTER_SYSTEM_PROMPT

    async def route(self, router: OllamaRouter, case: RoutingCase) -> StrategyResult:
        allowed = self._allowed(case)
        budget = Budget()
        result = await router.call(
            self._system_prompt(),
            build_user_prompt(case),
            response_format=enum_schema("route", allowed, with_message=False),
            max_tokens=self._max_tokens,
            temperature=self._temperature,
            thinking=self._thinking,
        )
        budget.add(result)
        return StrategyResult(_parse_capability(result, allowed), budget)


_STAGE1_SYSTEM = (
    "Decide one thing only: after this turn, does the user expect a FILE back that they did "
    "not have before (a changed document, a new document, or the document with annotations "
    "added), or do they expect an ANSWER in the chat?\n"
    'Answer "file" or "answer".\n'
    "A document being mentioned or described is not a request to produce a file. "
    "Questions about what a document contains, means, or whether something is present are "
    '"answer". Instructions to change, convert, protect, split, combine, annotate, or '
    'author a document are "file".'
)

_STAGE2_FILE_SYSTEM = (
    "The user wants a file back. Choose which one:\n"
    "- pdf_edit: change or convert the attached document(s).\n"
    "- pdf_create: author a brand new document from scratch.\n"
    "- pdf_review: hand the document back with review comments or sticky notes on it.\n"
    "- user_spec: define a reusable agent or automation rule, rather than acting once now."
)

_STAGE2_ANSWER_SYSTEM = (
    "The user wants an answer in chat. Choose which one:\n"
    "- pdf_question: the answer comes from reading the attached document(s).\n"
    "- unsupported: the question is about the assistant itself, or is unrelated to the "
    "attached documents; put a short helpful reply in 'message'."
)


class BinaryChain:
    """Two narrow decisions instead of one six-way one.

    Costs a second call, but each decision has a much smaller space, and the first one is
    exactly the distinction that is being got wrong today.
    """

    name = "binary_chain"
    description = "Stage 1: file-or-answer. Stage 2: pick within that half."

    def __init__(self, *, thinking: bool = False, fewshot: bool = True) -> None:
        self._thinking = thinking
        self._fewshot = fewshot

    async def route(self, router: OllamaRouter, case: RoutingCase) -> StrategyResult:
        budget = Budget()
        prompt = build_user_prompt(case)
        stage1_system = f"{_STAGE1_SYSTEM}\n\n{_FEWSHOT}" if self._fewshot else _STAGE1_SYSTEM
        stage1 = await router.call(
            stage1_system,
            prompt,
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "intent",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {"expects": {"type": "string", "enum": ["file", "answer"]}},
                        "required": ["expects"],
                        "additionalProperties": False,
                    },
                },
            },
            max_tokens=THINK_MAX_TOKENS if self._thinking else PROD_MAX_TOKENS,
            temperature=0.0,
            thinking=self._thinking,
        )
        budget.add(stage1)
        if stage1.error or stage1.finish_reason == "length":
            return StrategyResult("__error__" if stage1.error else "__truncated__", budget, "stage1")
        try:
            expects = json.loads(stage1.content).get("expects")
        except ValueError:
            return StrategyResult("__unparsable__", budget, "stage1")

        if expects == "file":
            allowed = ["pdf_edit", "pdf_create", "pdf_review", "user_spec"]
            if not case.files:
                allowed = ["pdf_create", "user_spec"]
            system = _STAGE2_FILE_SYSTEM
        else:
            allowed = ["pdf_question", "unsupported"]
            if not case.files:
                allowed = ["unsupported"]
            system = _STAGE2_ANSWER_SYSTEM

        if len(allowed) == 1:
            return StrategyResult(allowed[0], budget, f"stage1={expects}, stage2 skipped")

        stage2 = await router.call(
            system,
            prompt,
            response_format=enum_schema("route", allowed),
            max_tokens=THINK_MAX_TOKENS if self._thinking else PROD_MAX_TOKENS,
            temperature=0.0,
            thinking=self._thinking,
        )
        budget.add(stage2)
        return StrategyResult(_parse_capability(stage2, allowed), budget, f"stage1={expects}")


class SelfConsistency:
    """Sample the same decision N times and take the majority."""

    def __init__(self, n: int = 3, *, temperature: float = 0.6, thinking: bool = False, fewshot: bool = True) -> None:
        self.name = f"vote{n}"
        self.description = f"{n} samples at temperature {temperature}, majority wins."
        self._n = n
        self._temperature = temperature
        self._inner = _EnumRouter(
            f"vote{n}-inner",
            "",
            thinking=thinking,
            temperature=temperature,
            max_tokens=THINK_MAX_TOKENS if thinking else PROD_MAX_TOKENS,
            fewshot=fewshot,
        )

    async def route(self, router: OllamaRouter, case: RoutingCase) -> StrategyResult:
        budget = Budget()
        votes: list[str] = []
        for _ in range(self._n):
            single = await self._inner.route(router, case)
            budget.calls += single.budget.calls
            budget.input_tokens += single.budget.input_tokens
            budget.output_tokens += single.budget.output_tokens
            budget.thinking_chars += single.budget.thinking_chars
            budget.latency_s += single.budget.latency_s
            budget.errors.extend(single.budget.errors)
            votes.append(single.predicted)
        valid = [v for v in votes if v in CAPABILITIES]
        if not valid:
            return StrategyResult(votes[0] if votes else "__error__", budget, f"votes={votes}")
        winner, _ = Counter(valid).most_common(1)[0]
        return StrategyResult(winner, budget, f"votes={votes}")


def build_strategies() -> list[Strategy]:
    return [
        _EnumRouter(
            "prod_baseline",
            "Exactly what ships today: 6-way enum, no temperature set, 2048 cap, thinking left on.",
            thinking=True,
            temperature=None,
            max_tokens=PROD_MAX_TOKENS,
        ),
        _EnumRouter(
            "temp0",
            "Production prompt, temperature pinned to 0.",
            thinking=True,
            temperature=0.0,
            max_tokens=PROD_MAX_TOKENS,
        ),
        _EnumRouter(
            "thinking_off",
            "Temperature 0 and reasoning_effort=none.",
            thinking=False,
            temperature=0.0,
            max_tokens=PROD_MAX_TOKENS,
        ),
        _EnumRouter(
            "think_budget",
            "Thinking on, temperature 0, cap raised to 4096 so the chain cannot be truncated.",
            thinking=True,
            temperature=0.0,
            max_tokens=THINK_MAX_TOKENS,
        ),
        _EnumRouter(
            "fewshot_thinking_off",
            "Few-shot boundary examples, thinking off.",
            thinking=False,
            temperature=0.0,
            max_tokens=PROD_MAX_TOKENS,
            fewshot=True,
        ),
        _EnumRouter(
            "fewshot_think",
            "Few-shot boundary examples, thinking on with a 4096 cap.",
            thinking=True,
            temperature=0.0,
            max_tokens=THINK_MAX_TOKENS,
            fewshot=True,
        ),
        _EnumRouter(
            "fewshot_narrowed",
            "Few-shot, thinking off, plus enum narrowed by whether a file is attached.",
            thinking=False,
            temperature=0.0,
            max_tokens=PROD_MAX_TOKENS,
            fewshot=True,
            narrow_by_files=True,
        ),
        BinaryChain(thinking=False, fewshot=True),
        SelfConsistency(3, temperature=0.6, thinking=False, fewshot=True),
    ]
