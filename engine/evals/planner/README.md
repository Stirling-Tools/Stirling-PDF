# Planner eval

Measures the second decision in an edit request: once the orchestrator has routed to
`pdf_edit`, which of the 73 operations gets chosen.

It exists to quantify one specific thing. The production planner prompt is roughly 6,800
tokens; a default Ollama accepts about 2,050 and silently drops the head. This eval
measures what that costs, rather than assuming it costs something.

```bash
uv run --group engine python evals/planner/runner.py
```

## The three strategies

| Strategy | Prompt shape |
| --- | --- |
| `prod` | Production order - request first, then the full catalogue. Overruns the context. |
| `request_last` | Identical content, request moved to the tail, which survives truncation. |
| `shortlist` | Top-N operations by embedding similarity (`nomic-embed-text`), request last. Fits comfortably. |

`--shortlist N` sets the candidate count; the runner prints recall@N first, so a low score
there is visible before the accuracy numbers are read.

## Why position is reported

`dataset.py` records each expected operation's index in `OPERATIONS`, and the menu is
rendered in that order. Conversions occupy 0-25 and lose their descriptions first;
security operations at 63-72 always survive. Accuracy is therefore broken out by catalogue
band, and `mean_picked_index` shows whether a strategy's answers are being dragged toward
the end of the list.

The response schema enumerates all 73 endpoints regardless of what the prompt contains -
exactly as production does, since `ToolEndpoint` is a `StrEnum`. A truncated prompt does
not stop the model naming an operation; it only stops it reading what that operation does.

## Caveats

- Cases are single-operation. Production can chain, and chained plans are not measured here.
- `also_ok` marks operations that genuinely satisfy a request too (CSV for a spreadsheet ask).
- Latency is measured under `--concurrency`, so it is throughput rather than user-facing.
- **`prompt_tokens_reported` is not a truncation measure.** Ollama counts only
  newly-evaluated tokens, so cases sharing a long prefix report far fewer than they sent.
  Measure the ceiling with a single controlled request instead: send one oversized prompt
  and read `usage.prompt_tokens` off it alone.
