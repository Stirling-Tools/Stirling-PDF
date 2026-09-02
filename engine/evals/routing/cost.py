"""Cost model for the routing decision.

Two questions the eval alone does not answer:

1. What does each routing strategy cost per conversation, in tokens, in local GPU
   seconds, and in dollars if the same orchestrator runs on the hosted default
   (engine/.env ships ``anthropic:claude-haiku-4-5``)?
2. How big is that cost next to the rest of the request it is deciding for?

Run after runner.py:

    uv run --group engine python evals/routing/cost.py
"""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

_EVALS_ROOT = Path(__file__).resolve().parents[1]
if str(_EVALS_ROOT) not in sys.path:
    sys.path.insert(0, str(_EVALS_ROOT))
_SRC = _EVALS_ROOT.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))


# Claude Haiku 4.5 list price, the hosted default in engine/.env. USD per million tokens.
HAIKU_INPUT_PER_MTOK = 1.00
HAIKU_OUTPUT_PER_MTOK = 5.00


@dataclass(frozen=True)
class StageProfile:
    """One model call in a request, sized from the real rendered prompts."""

    name: str
    input_tokens: int
    output_tokens: int
    note: str


def measure_pipeline_stages() -> list[StageProfile]:
    """Token profile of a single-operation pdf_edit request, measured not guessed."""
    import tiktoken

    from stirling.agents.orchestrator import _ROUTER_SYSTEM_PROMPT
    from stirling.agents.pdf_edit import PdfEditAgent
    from stirling.models import OPERATIONS

    encoding = tiktoken.get_encoding("cl100k_base")
    operations = list(OPERATIONS.keys())

    def count(text: str) -> int:
        return len(encoding.encode(text))

    menu = PdfEditAgent._get_supported_operations_prompt(operations)
    flat_names = PdfEditAgent._get_operations_prompt(operations)

    # A representative turn: short message, one file, no history.
    turn_overhead = count("Conversation history:\nNone\nUser message: Rotate all pages 90 degrees\nFiles: a.pdf\n")

    router_in = count(_ROUTER_SYSTEM_PROMPT) + turn_overhead + count("Available artifacts:\n- none")
    # The planner's system prompt carries the flat name+path list; the user prompt carries
    # the full menu with every parameter description.
    planner_in = count(flat_names) + count(menu) + turn_overhead + 200

    # One parameter call per planned operation. It re-sends the same turn plus the
    # selected operation's schema, and pydantic-ai passes the model the full schema.
    param_schema_tokens = max(count(json.dumps(OPERATIONS[op].model_json_schema())) for op in operations)
    median_schema = sorted(count(json.dumps(OPERATIONS[op].model_json_schema())) for op in operations)[
        len(operations) // 2
    ]

    return [
        StageProfile("router", router_in, 8, "6-way enum decision"),
        StageProfile("edit planner", planner_in, 60, f"73-operation menu ({count(menu)} tok) + flat list"),
        StageProfile("parameter call", median_schema + turn_overhead + 100, 60, "one per planned operation"),
        StageProfile(
            "parameter call (worst schema)",
            param_schema_tokens + turn_overhead + 100,
            60,
            "largest operation schema",
        ),
    ]


def dollars(input_tokens: float, output_tokens: float) -> float:
    return input_tokens / 1e6 * HAIKU_INPUT_PER_MTOK + output_tokens / 1e6 * HAIKU_OUTPUT_PER_MTOK


def build_cost_table(summary_path: Path) -> dict:
    payload = json.loads(summary_path.read_text(encoding="utf-8"))
    summary = payload["summary"]

    rows = []
    for name, stats in summary.items():
        per_conv_in = stats["avg_input_tokens"]
        per_conv_out = stats["avg_output_tokens"]
        accuracy = stats["accuracy"]
        usd_1k = dollars(per_conv_in * 1000, per_conv_out * 1000)
        # A wrong route is wasted spend plus a wasted downstream pipeline, so the honest
        # unit is cost per correctly-routed conversation.
        usd_1k_correct = usd_1k / accuracy if accuracy else float("inf")
        rows.append(
            {
                "strategy": name,
                "description": payload["strategy_descriptions"].get(name, ""),
                "accuracy": accuracy,
                "accuracy_with_tolerated": stats["accuracy_with_tolerated"],
                "destructive_misroutes": stats["destructive_misroutes"],
                "hard_failures": stats["hard_failures"],
                "avg_calls": stats["avg_calls"],
                "avg_input_tokens": per_conv_in,
                "avg_output_tokens": per_conv_out,
                "avg_thinking_chars": stats["avg_thinking_chars"],
                "avg_latency_s": stats["avg_latency_s"],
                "p90_latency_s": stats["p90_latency_s"],
                "usd_per_1k_conversations": round(usd_1k, 4),
                "usd_per_1k_correct": round(usd_1k_correct, 4),
                "by_band": stats["by_band"],
                "top_confusions": stats["top_confusions"],
            }
        )
    rows.sort(key=lambda r: -r["accuracy"])
    return {"meta": payload, "rows": rows}


def main() -> None:
    results = Path("evals/routing/results/summary.json")
    stages = measure_pipeline_stages()

    print("=== Measured pipeline token profile (single-operation pdf_edit request) ===")
    total_in = 0
    for stage in stages:
        if "worst" in stage.name:
            continue
        total_in += stage.input_tokens
        print(f"  {stage.name:24s} in={stage.input_tokens:6d}  out={stage.output_tokens:4d}  {stage.note}")
    print(f"  {'TOTAL (3 calls)':24s} in={total_in:6d}")
    router_share = stages[0].input_tokens / total_in
    print(f"  router share of input tokens: {router_share:.1%}")

    if not results.exists():
        print("\nNo eval results yet - run runner.py first.")
        return

    table = build_cost_table(results)
    print("\n=== Per-strategy cost (measured) ===")
    print(
        f"{'strategy':20s} {'acc':>6s} {'dstr':>5s} {'calls':>6s} {'in':>7s} "
        f"{'out':>6s} {'lat_s':>7s} {'$/1k':>8s} {'$/1k ok':>8s}"
    )
    for row in table["rows"]:
        print(
            f"{row['strategy']:20s} {row['accuracy']:6.1%} {row['destructive_misroutes']:5d} "
            f"{row['avg_calls']:6.2f} {row['avg_input_tokens']:7.0f} {row['avg_output_tokens']:6.0f} "
            f"{row['avg_latency_s']:7.2f} {row['usd_per_1k_conversations']:8.3f} {row['usd_per_1k_correct']:8.3f}"
        )

    out = Path("evals/routing/results/cost.json")
    out.write_text(
        json.dumps(
            {
                "pricing": {
                    "model": "claude-haiku-4-5",
                    "input_per_mtok": HAIKU_INPUT_PER_MTOK,
                    "output_per_mtok": HAIKU_OUTPUT_PER_MTOK,
                },
                "pipeline_stages": [vars(s) for s in stages],
                "strategies": table["rows"],
                "meta": {k: v for k, v in table["meta"].items() if k != "summary"},
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
