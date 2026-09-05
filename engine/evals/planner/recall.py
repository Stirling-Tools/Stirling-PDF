"""Sweep operation-retrieval settings for the planner shortlist.

Recall is the planner's ceiling: the model was correct on every case whose answer reached
the candidate list, so an operation that retrieval misses is an operation the planner
cannot pick. Recall needs embeddings only - no generation - so a full sweep costs seconds
and can be run before spending anything on the model.

    uv run --group engine python evals/planner/recall.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import httpx

_EVALS_ROOT = Path(__file__).resolve().parents[1]
if str(_EVALS_ROOT) not in sys.path:
    sys.path.insert(0, str(_EVALS_ROOT))
_SRC = _EVALS_ROOT.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

from planner.dataset import CASES  # noqa: E402
from planner.runner import (  # noqa: E402
    ALL_OPS,
    EMBED_MODEL,
    EMBED_URL,
    INDEX_OF,
    bm25_scores,
    cosine,
    rank_fusion,
    retrieval_text,
    tokenize,
)

from stirling.models import OPERATIONS, ToolEndpoint  # noqa: E402


def op_text(op: ToolEndpoint, *, variant: str) -> str:
    """How an operation is described to the retriever."""
    schema = OPERATIONS[op].model_json_schema()
    description = (schema.get("description") or "").strip()
    name = op.name.replace("_", " ").lower()
    if variant == "name":
        return name
    if variant == "name_desc":
        return f"{name}. {description}"
    return retrieval_text(op)


async def embed_all(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    response = await client.post(EMBED_URL, json={"model": EMBED_MODEL, "input": texts}, timeout=600.0)
    return response.json()["embeddings"]


async def main() -> None:
    variants = ["name", "name_desc", "name_desc_params"]
    cutoffs = [5, 10, 12, 15, 20, 30]
    results: dict[str, dict[str, dict[int, float]]] = {}
    best_rankings: dict[str, dict[str, list[list[str]]]] = {}

    async with httpx.AsyncClient() as http:
        case_vectors = await embed_all(http, [c.message for c in CASES])

        for variant in variants:
            texts = [op_text(op, variant=variant) for op in ALL_OPS]
            op_vectors = await embed_all(http, texts)
            corpus = [tokenize(t) for t in texts]
            results[variant] = {"vector": {}, "bm25": {}, "hybrid": {}}

            per_case: dict[str, list[list[str]]] = {"vector": [], "bm25": [], "hybrid": []}
            for case, vector in zip(CASES, case_vectors, strict=True):
                vec_rank = sorted(ALL_OPS, key=lambda op: -cosine(vector, op_vectors[INDEX_OF[op.name]]))
                vec_names = [op.name for op in vec_rank]
                lex = bm25_scores(case.message, corpus)
                lex_names = [op.name for op in sorted(ALL_OPS, key=lambda op: -lex[INDEX_OF[op.name]])]
                per_case["vector"].append(vec_names)
                per_case["bm25"].append(lex_names)
                per_case["hybrid"].append(rank_fusion(vec_names, lex_names))

            best_rankings[variant] = per_case
            for method, rankings in per_case.items():
                for cutoff in cutoffs:
                    hits = sum(
                        1 for case, ranking in zip(CASES, rankings, strict=True) if case.expected in ranking[:cutoff]
                    )
                    results[variant][method][cutoff] = round(hits / len(CASES), 4)

    header = "  ".join(f"@{c:<5}" for c in cutoffs)
    print(f"{'embedding text':<20} {'method':<8} {header}")
    for variant, methods in results.items():
        for method, by_cutoff in methods.items():
            row = "  ".join(f"{by_cutoff[c]:<6.1%}" for c in cutoffs)
            print(f"{variant:<20} {method:<8} {row}")

    best = max(
        ((v, m, c, s) for v, ms in results.items() for m, cs in ms.items() for c, s in cs.items()),
        key=lambda row: (row[3], -row[2]),
    )
    print(f"\nBest: {best[0]} + {best[1]} @{best[2]} = {best[3]:.1%}")

    # What the winner still cannot reach, so the next change has somewhere to aim.
    best_variant, best_method, best_cutoff, _ = best
    misses = [
        {"case": case.id, "expected": case.expected, "rank": ranking.index(case.expected) + 1}
        for case, ranking in zip(CASES, best_rankings[best_variant][best_method], strict=True)
        if case.expected not in ranking[:best_cutoff]
    ]
    if misses:
        print(f"\nStill missed at @{best_cutoff} ({len(misses)} of {len(CASES)}) - true rank in brackets:")
        for miss in sorted(misses, key=lambda m: m["rank"]):
            print(f"  {miss['case']:<16} {miss['expected']:<24} [{miss['rank']}]")

    out = Path("evals/planner/results/recall.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps({"cutoffs": cutoffs, "results": results, "misses_at_best": misses}, indent=2),
        encoding="utf-8",
    )
    print(f"\nWrote {out}")


if __name__ == "__main__":
    asyncio.run(main())
