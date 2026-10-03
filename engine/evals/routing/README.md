# Routing eval

Measures the orchestrator's top-level capability decision - the one that sends a turn to
`pdf_edit`, `pdf_question`, `pdf_review`, `pdf_create`, `user_spec`, or `unsupported`.

It exists because the reported failure ("asking a question and it runs a tool instead") is
a routing failure, and prompt changes aimed at it were otherwise unmeasurable.

## Running it

Needs a reachable Ollama with the model pulled. Nothing else - no engine server, no database.

```bash
uv run --group engine python evals/routing/runner.py
```

Useful flags:

| Flag | Purpose |
| --- | --- |
| `--strategies thinking_off,fewshot_thinking_off` | Run a subset. |
| `--repeats 5` | Run each case N times; feeds the `unstable_cases` count. |
| `--concurrency 3` | Parallel in-flight requests. |
| `--model qwen2.5:7b` | Compare models on the same cases. |
| `--limit 8` | Smoke test. |

Then turn the results into the cost table:

```bash
uv run --group engine python evals/routing/cost.py
```

Outputs land in `evals/routing/results/`: `summary.json` (per-strategy scores),
`observations.jsonl` (one row per case per strategy, for re-scoring without re-spending),
and `cost.json`.

## What is scored

`dataset.py` holds 82 labelled turns in four bands:

- **clear** - unambiguous either way.
- **boundary** - question and edit phrased almost identically ("Are there any blank pages?"
  vs "Remove the blank pages"). This is the reported failure mode.
- **contextual** - only resolvable from conversation history ("yes do that", "now rotate it").
- **adversarial** - a tool's name appears in a turn that is not asking for that tool
  ("Which section talks about the merger?").

Beyond plain accuracy the runner reports:

- **destructive misroutes** - a read-only turn sent to a mutating capability. Weighted
  separately because that direction changes the user's file; the reverse only answers.
- **hard failures** - truncated, unparsable, or off-menu model output.
- **unstable cases** - with `--repeats > 1`, cases where the same input routed differently
  across runs.

`tolerated` on a case marks a genuinely defensible second answer, scored as a near-miss
rather than a failure, so the boundary cases do not punish reasonable disagreement.

## Adding a strategy

Implement the `Strategy` protocol in `strategies.py` (a `name`, a `description`, and an
async `route`) and add it to `build_strategies()`. The prompts come from
`stirling.agents.orchestrator`, so the baseline tracks production rather than a copy of it.

## Caveats

- Latency is measured under `--concurrency`, so it reflects throughput, not the latency a
  single user sees. Re-run with `--concurrency 1` for user-facing latency.
- `reasoning_effort: "none"` is the only thinking switch Ollama honours on the
  OpenAI-compatible path for qwen3; `chat_template_kwargs={"enable_thinking": false}` and a
  `/no_think` suffix are both ignored.
- The eval sends prompts directly rather than through pydantic-ai, so it does not exercise
  pydantic-ai's output-validation retries. A `__truncated__` result here is what production
  spends a retry on.
