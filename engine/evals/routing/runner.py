"""Run the routing eval and write results to JSON.

    uv run --group engine python evals/routing/runner.py --out evals/routing/results

Every strategy sees every case. Results are written per call so a run can be re-scored or
re-charted without paying for the model calls again.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import httpx

_EVALS_ROOT = Path(__file__).resolve().parents[1]
if str(_EVALS_ROOT) not in sys.path:
    sys.path.insert(0, str(_EVALS_ROOT))
_SRC = _EVALS_ROOT.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from routing.client import DEFAULT_BASE_URL, DEFAULT_MODEL, OllamaRouter  # noqa: E402
from routing.dataset import CASES, Band, RoutingCase, is_destructive_miss  # noqa: E402
from routing.strategies import Strategy, build_strategies  # noqa: E402


@dataclass
class Observation:
    strategy: str
    case_id: str
    band: str
    expected: str
    predicted: str
    correct: bool
    tolerated: bool
    destructive: bool
    failed: bool
    calls: int
    input_tokens: int
    output_tokens: int
    thinking_chars: int
    latency_s: float
    repeat: int
    errors: list[str]


def score(case: RoutingCase, predicted: str) -> tuple[bool, bool, bool, bool]:
    """(correct, tolerated, destructive_miss, hard_failure)."""
    failed = predicted.startswith("__")
    correct = predicted == case.expected
    tolerated = (not correct) and predicted in case.tolerated
    destructive = (not failed) and is_destructive_miss(case, predicted)
    return correct, tolerated, destructive, failed


async def run_one(
    router: OllamaRouter,
    strategy: Strategy,
    case: RoutingCase,
    repeat: int,
    semaphore: asyncio.Semaphore,
) -> Observation:
    async with semaphore:
        result = await strategy.route(router, case)
    correct, tolerated, destructive, failed = score(case, result.predicted)
    return Observation(
        strategy=strategy.name,
        case_id=case.id,
        band=str(case.band),
        expected=case.expected,
        predicted=result.predicted,
        correct=correct,
        tolerated=tolerated,
        destructive=destructive,
        failed=failed,
        calls=result.budget.calls,
        input_tokens=result.budget.input_tokens,
        output_tokens=result.budget.output_tokens,
        thinking_chars=result.budget.thinking_chars,
        latency_s=round(result.budget.latency_s, 3),
        repeat=repeat,
        errors=result.budget.errors,
    )


def summarise(observations: list[Observation]) -> dict[str, Any]:
    by_strategy: dict[str, list[Observation]] = defaultdict(list)
    for obs in observations:
        by_strategy[obs.strategy].append(obs)

    summary: dict[str, Any] = {}
    for name, rows in by_strategy.items():
        total = len(rows)
        bands: dict[str, dict[str, float]] = {}
        for band in Band:
            band_rows = [r for r in rows if r.band == str(band)]
            if band_rows:
                bands[str(band)] = {
                    "n": len(band_rows),
                    "accuracy": round(sum(r.correct for r in band_rows) / len(band_rows), 4),
                }
        confusion = Counter((r.expected, r.predicted) for r in rows if not r.correct)
        # Stability: how often repeats of the same case disagree with each other.
        grouped: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            grouped[row.case_id].add(row.predicted)
        unstable = sum(1 for preds in grouped.values() if len(preds) > 1)

        summary[name] = {
            "n": total,
            "accuracy": round(sum(r.correct for r in rows) / total, 4),
            "accuracy_with_tolerated": round(sum(r.correct or r.tolerated for r in rows) / total, 4),
            "destructive_misroutes": sum(r.destructive for r in rows),
            "hard_failures": sum(r.failed for r in rows),
            "unstable_cases": unstable,
            "cases_seen": len(grouped),
            "avg_calls": round(sum(r.calls for r in rows) / total, 3),
            "avg_input_tokens": round(sum(r.input_tokens for r in rows) / total, 1),
            "avg_output_tokens": round(sum(r.output_tokens for r in rows) / total, 1),
            "avg_thinking_chars": round(sum(r.thinking_chars for r in rows) / total, 1),
            "avg_latency_s": round(sum(r.latency_s for r in rows) / total, 2),
            "p90_latency_s": round(sorted(r.latency_s for r in rows)[int(0.9 * (total - 1))], 2),
            "total_latency_s": round(sum(r.latency_s for r in rows), 1),
            "by_band": bands,
            "top_confusions": [{"expected": e, "predicted": p, "count": c} for (e, p), c in confusion.most_common(8)],
        }
    return summary


async def main() -> None:
    parser = argparse.ArgumentParser(description="Routing eval for the orchestrator's capability decision.")
    parser.add_argument("--out", default="evals/routing/results", help="Output directory.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--repeats", type=int, default=1, help="Runs per case, for stability measurement.")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--strategies", default="", help="Comma-separated subset of strategy names.")
    parser.add_argument("--limit", type=int, default=0, help="Cap the number of cases (smoke tests).")
    args = parser.parse_args()

    strategies = build_strategies()
    if args.strategies:
        wanted = {s.strip() for s in args.strategies.split(",")}
        strategies = [s for s in strategies if s.name in wanted]
        missing = wanted - {s.name for s in strategies}
        if missing:
            parser.error(f"Unknown strategies: {sorted(missing)}")
    cases = CASES[: args.limit] if args.limit else CASES

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    semaphore = asyncio.Semaphore(args.concurrency)
    started = time.monotonic()
    observations: list[Observation] = []

    async with httpx.AsyncClient() as http:
        router = OllamaRouter(http, model=args.model, base_url=args.base_url)
        for strategy in strategies:
            strategy_started = time.monotonic()
            tasks = [
                run_one(router, strategy, case, repeat, semaphore) for repeat in range(args.repeats) for case in cases
            ]
            results = await asyncio.gather(*tasks)
            observations.extend(results)
            accuracy = sum(r.correct for r in results) / len(results)
            print(
                f"{strategy.name:20s} acc={accuracy:6.1%} "
                f"destructive={sum(r.destructive for r in results):3d} "
                f"fail={sum(r.failed for r in results):3d} "
                f"wall={time.monotonic() - strategy_started:6.1f}s",
                flush=True,
            )

    payload = {
        "model": args.model,
        "repeats": args.repeats,
        "concurrency": args.concurrency,
        "case_count": len(cases),
        "wall_clock_s": round(time.monotonic() - started, 1),
        "strategy_descriptions": {s.name: s.description for s in strategies},
        "summary": summarise(observations),
    }
    (out_dir / "summary.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    with (out_dir / "observations.jsonl").open("w", encoding="utf-8") as handle:
        for obs in observations:
            handle.write(json.dumps(asdict(obs)) + "\n")
    print(f"\nWrote {out_dir / 'summary.json'} and observations.jsonl ({len(observations)} rows)")


if __name__ == "__main__":
    asyncio.run(main())
