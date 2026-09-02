"""Measure pdf_edit tool selection, and how much of it the context ceiling costs.

    uv run --group engine python evals/planner/runner.py

Strategies share one decision - pick the operation that answers the request - and differ
only in how the 73-operation catalogue is presented. The production prompt overruns what
Ollama will accept, so this quantifies the damage rather than assuming it.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import re
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

from planner.dataset import CASES, PlannerCase, band_for  # noqa: E402
from routing.client import OllamaRouter  # noqa: E402

from stirling.agents.pdf_edit import PdfEditAgent  # noqa: E402
from stirling.models import OPERATIONS, ToolEndpoint  # noqa: E402

ALL_OPS: list[ToolEndpoint] = list(OPERATIONS.keys())
INDEX_OF: dict[str, int] = {op.name: i for i, op in enumerate(ALL_OPS)}
BY_VALUE: dict[str, ToolEndpoint] = {op.value: op for op in ALL_OPS}

EMBED_URL = "http://localhost:11434/api/embed"
EMBED_MODEL = "nomic-embed-text"

_SYSTEM = (
    "Plan PDF edit requests. Choose the single operation that best answers the request. "
    "Each operation is listed with its description. Treat that list as authoritative: an "
    "operation can only do what its description allows."
)


@dataclass
class PlannerObservation:
    strategy: str
    case_id: str
    expected: str
    predicted: str
    correct: bool
    expected_index: int
    predicted_index: int
    band: str
    prompt_tokens_sent: int
    # Ollama reports only newly-evaluated tokens, so a shared prefix across cases makes
    # this read low. Use the controlled probes, not this, to measure truncation.
    prompt_tokens_reported: int
    latency_s: float


_WORD = re.compile(r"[a-z0-9]+")
# Splits SCREAMING_SNAKE endpoint names into their parts so PDF_TO_WORD matches "word".
_STOPWORDS = frozenset({"pdf", "the", "this", "a", "an", "of", "to", "and", "for", "it", "into", "out"})


def tokenize(text: str) -> list[str]:
    return [w for w in _WORD.findall(text.lower().replace("_", " ")) if w not in _STOPWORDS]


def bm25_scores(query: str, corpus: list[list[str]]) -> list[float]:
    """Plain BM25 over the operation texts, as the lexical half of hybrid retrieval."""
    k1, b = 1.5, 0.75
    lengths = [len(doc) for doc in corpus]
    avg_len = sum(lengths) / len(lengths)
    doc_freq: Counter[str] = Counter()
    for doc in corpus:
        doc_freq.update(set(doc))
    n = len(corpus)
    scores = [0.0] * n
    for term in tokenize(query):
        df = doc_freq.get(term, 0)
        if not df:
            continue
        idf = math.log(1 + (n - df + 0.5) / (df + 0.5))
        for i, doc in enumerate(corpus):
            tf = doc.count(term)
            if tf:
                scores[i] += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * lengths[i] / avg_len))
    return scores


def rank_fusion(*rankings: list[str], k: int = 60) -> list[str]:
    """Reciprocal rank fusion - combines rankings without needing comparable scores."""
    fused: dict[str, float] = {}
    for ranking in rankings:
        for position, name in enumerate(ranking):
            fused[name] = fused.get(name, 0.0) + 1.0 / (k + position + 1)
    return sorted(fused, key=lambda name: -fused[name])


def op_line(op: ToolEndpoint) -> str:
    schema = OPERATIONS[op].model_json_schema()
    description = (schema.get("description") or "").strip()
    return f"- {op.name} ({op.value}): {description}" if description else f"- {op.name} ({op.value})"


def retrieval_text(op: ToolEndpoint) -> str:
    """What the retriever indexes - richer than what the prompt shows.

    Parameter descriptions carry the words users actually type ("watermark opacity",
    "OCR language"), and including them lifted recall@12 from 77.3% to 88.6%. They stay out
    of the prompt itself, which only needs enough to tell the candidates apart.
    """
    model = OPERATIONS[op]
    description = (model.model_json_schema().get("description") or "").strip()
    # Field metadata, not the JSON schema: enum-typed fields render as a bare "$ref" and
    # lose their description there.
    params = [(f.description or "").strip() for f in model.model_fields.values() if (f.description or "").strip()]
    return f"{op.name.replace('_', ' ').lower()}. {description} {' '.join(params)}".strip()


def endpoint_schema(ops: list[ToolEndpoint]) -> dict[str, Any]:
    """Mirrors production: ToolEndpoint is a StrEnum, so the schema carries the path values.

    The names stay selectable even when the prompt describing them is truncated away, which
    is exactly the production failure - the model can still name an operation it can no
    longer read about.
    """
    return {
        "type": "json_schema",
        "json_schema": {
            "name": "plan",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {"operation": {"type": "string", "enum": [op.value for op in ops]}},
                "required": ["operation"],
                "additionalProperties": False,
            },
        },
    }


async def embed(client: httpx.AsyncClient, texts: list[str]) -> list[list[float]]:
    response = await client.post(EMBED_URL, json={"model": EMBED_MODEL, "input": texts}, timeout=600.0)
    return response.json()["embeddings"]


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(y * y for y in b) ** 0.5
    return dot / (na * nb) if na and nb else 0.0


def prod_prompt(case: PlannerCase) -> str:
    """The production shape: request first, then the full catalogue."""
    menu = PdfEditAgent._get_supported_operations_prompt(ALL_OPS)
    return (
        f"Conversation history:\nNone\n"
        f"User request: {case.message}\n"
        f"Files: document.pdf\n"
        f"Supported operations:\n{menu}\n"
        f"Extracted page text:\nNone"
    )


def request_last_prompt(case: PlannerCase) -> str:
    """Same content, request moved to the tail - the part that survives truncation."""
    menu = PdfEditAgent._get_supported_operations_prompt(ALL_OPS)
    return (
        f"Supported operations:\n{menu}\n"
        f"Conversation history:\nNone\n"
        f"Files: document.pdf\n"
        f"Extracted page text:\nNone\n"
        f"User request: {case.message}"
    )


def shortlist_prompt(case: PlannerCase, ops: list[ToolEndpoint], *, rich: bool = False) -> str:
    """Candidates only. ``rich`` spends the space a short list frees on describing them.

    The plain line carries the operation's own description; ``rich`` adds the parameter text
    on top. With only 12-20 candidates there is room for both and the prompt still sits far
    inside the context ceiling.
    """
    render = (lambda op: f"- {op.name} ({op.value}): {retrieval_text(op)}") if rich else op_line
    menu = "\n".join(render(op) for op in ops)
    return (
        f"Candidate operations:\n{menu}\nConversation history:\nNone\nFiles: document.pdf\nUser request: {case.message}"
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description="pdf_edit tool-selection eval.")
    parser.add_argument("--out", default="evals/planner/results")
    parser.add_argument("--model", default="qwen3:8b")
    parser.add_argument("--concurrency", type=int, default=3)
    parser.add_argument("--shortlist", type=int, default=12)
    parser.add_argument("--strategies", default="prod,request_last,shortlist")
    parser.add_argument("--retrieval", default="hybrid", choices=["vector", "hybrid"])
    args = parser.parse_args()

    import tiktoken

    encoding = tiktoken.get_encoding("cl100k_base")
    semaphore = asyncio.Semaphore(args.concurrency)
    observations: list[PlannerObservation] = []

    async with httpx.AsyncClient() as http:
        router = OllamaRouter(http, model=args.model)

        print("Embedding the operation catalogue...", flush=True)
        texts = [retrieval_text(op) for op in ALL_OPS]
        op_vectors = await embed(http, texts)
        corpus = [tokenize(t) for t in texts]
        case_vectors = await embed(http, [c.message for c in CASES])
        shortlists: dict[str, list[ToolEndpoint]] = {}
        by_name = {op.name: op for op in ALL_OPS}
        for case, vector in zip(CASES, case_vectors, strict=True):
            vector_rank = [
                op.name for op in sorted(ALL_OPS, key=lambda op: -cosine(vector, op_vectors[INDEX_OF[op.name]]))
            ]
            if args.retrieval == "vector":
                ranked_names = vector_rank
            else:
                lexical = bm25_scores(case.message, corpus)
                lexical_rank = [op.name for op in sorted(ALL_OPS, key=lambda op: -lexical[INDEX_OF[op.name]])]
                ranked_names = rank_fusion(vector_rank, lexical_rank)
            shortlists[case.id] = [by_name[n] for n in ranked_names[: args.shortlist]]
        recall = sum(1 for c in CASES if c.expected in {op.name for op in shortlists[c.id]}) / len(CASES)
        print(f"Shortlist recall@{args.shortlist} ({args.retrieval}): {recall:.1%}", flush=True)

        async def run(strategy: str, case: PlannerCase) -> PlannerObservation:
            if strategy == "prod":
                prompt, ops = prod_prompt(case), ALL_OPS
            elif strategy == "request_last":
                prompt, ops = request_last_prompt(case), ALL_OPS
            else:
                ops = shortlists[case.id]
                prompt = shortlist_prompt(case, ops, rich=strategy == "shortlist_rich")
            sent = len(encoding.encode(_SYSTEM)) + len(encoding.encode(prompt))
            async with semaphore:
                result = await router.call(
                    _SYSTEM,
                    prompt,
                    response_format=endpoint_schema(ops),
                    max_tokens=4096,
                    temperature=0.0,
                    thinking=True,
                )
            predicted = "__failed__"
            if not result.error and result.finish_reason != "length":
                try:
                    value = json.loads(result.content).get("operation")
                    predicted = BY_VALUE[value].name if value in BY_VALUE else "__offmenu__"
                except ValueError:
                    predicted = "__unparsable__"
            correct = predicted == case.expected or predicted in case.also_ok
            return PlannerObservation(
                strategy=strategy,
                case_id=case.id,
                expected=case.expected,
                predicted=predicted,
                correct=correct,
                expected_index=INDEX_OF[case.expected],
                predicted_index=INDEX_OF.get(predicted, -1),
                band=band_for(INDEX_OF[case.expected]),
                prompt_tokens_sent=sent,
                prompt_tokens_reported=result.input_tokens,
                latency_s=round(result.latency_s, 3),
            )

        for strategy in [s.strip() for s in args.strategies.split(",")]:
            started = time.monotonic()
            rows = await asyncio.gather(*[run(strategy, case) for case in CASES])
            observations.extend(rows)
            print(
                f"{strategy:14s} acc={sum(r.correct for r in rows) / len(rows):6.1%} "
                f"sent={rows[0].prompt_tokens_sent:5d} "
                f"wall={time.monotonic() - started:6.1f}s",
                flush=True,
            )

    summary: dict[str, Any] = {}
    grouped: dict[str, list[PlannerObservation]] = defaultdict(list)
    for obs in observations:
        grouped[obs.strategy].append(obs)
    for name, rows in grouped.items():
        bands = {}
        for band in {r.band for r in rows}:
            band_rows = [r for r in rows if r.band == band]
            bands[band] = {
                "n": len(band_rows),
                "accuracy": round(sum(r.correct for r in band_rows) / len(band_rows), 4),
            }
        picked = [r.predicted_index for r in rows if r.predicted_index >= 0]
        summary[name] = {
            "accuracy": round(sum(r.correct for r in rows) / len(rows), 4),
            "prompt_tokens_sent": rows[0].prompt_tokens_sent,
            "prompt_tokens_reported_avg": round(sum(r.prompt_tokens_reported for r in rows) / len(rows), 1),
            "avg_latency_s": round(sum(r.latency_s for r in rows) / len(rows), 2),
            # Where in the catalogue its answers come from: truncation should drag this late.
            "mean_picked_index": round(sum(picked) / len(picked), 1) if picked else None,
            "by_band": dict(sorted(bands.items())),
            "wrong": [
                {"case": r.case_id, "expected": r.expected, "picked": r.predicted} for r in rows if not r.correct
            ][:15],
            "top_wrong_picks": Counter(r.predicted for r in rows if not r.correct).most_common(5),
        }

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "summary.json").write_text(
        json.dumps({"model": args.model, "case_count": len(CASES), "summary": summary}, indent=2),
        encoding="utf-8",
    )
    with (out_dir / "observations.jsonl").open("w", encoding="utf-8") as handle:
        for obs in observations:
            handle.write(json.dumps(asdict(obs)) + "\n")
    expected_mean = sum(INDEX_OF[c.expected] for c in CASES) / len(CASES)
    print(f"\nMean catalogue index of the chosen operation (expected mean {expected_mean:.1f}):")
    for name, stats in summary.items():
        print(f"  {name:14s} {stats['mean_picked_index']}")
    print(f"\nWrote {out_dir / 'summary.json'}")


if __name__ == "__main__":
    asyncio.run(main())
