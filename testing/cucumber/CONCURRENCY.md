# Concurrency validation for the behave suite

Two independent layers, usable together:

1. **Per-operation** - the same request is fired N times at once and every response
   must match the uncontended baseline.
2. **Suite-level shards** - the whole suite runs as N concurrent behave processes,
   so scenarios with genuinely different payloads contend on one backend.

## 1. Per-operation concurrency

Off by default. Turn it on for the whole suite with an environment variable:

```bash
CUCUMBER_PARALLEL=10 python -m behave
```

Every `I send the API request to the endpoint "..."` step then:

1. sends the request once, uncontended - this stays `context.response`, so the
   scenario's existing `Then` steps assert against exactly what they always did;
2. fires 10 more copies of the identical request concurrently;
3. asserts every concurrent response matches the baseline's fingerprint.

Because step 1 is unchanged, enabling the switch cannot change the meaning of an
existing assertion. A failure is always reported as a concurrency problem.

### Declaring it in Gherkin

One representative scenario per PDF endpoint carries the step already, so a plain
`python -m behave` with no environment variable still checks all 61 of them:

```gherkin
When I send the API request to the endpoint "/api/v1/general/rotate-pdf"
And this operation is run 5 times in parallel
Then the response PDF should contain 3 pages
```

That costs roughly 430 extra requests and about 8 seconds on a normal run. The
21 endpoints backed by heavy external binaries (OCR, LibreOffice, Calibre,
Ghostscript, qpdf) are deliberately left out so the default suite stays quick;
they are still covered whenever `CUCUMBER_PARALLEL` is set, throttled to
`CUCUMBER_PARALLEL_HEAVY`.

The step also works before the send. If `CUCUMBER_PARALLEL` asks for more copies
than the number written in the file, the higher value wins and the operation is
still only validated once. `this operation is not run in parallel` opts a single
scenario out.

When adding a new endpoint to the suite, put the step on one of its scenarios.

### What counts as "the same response"

Byte comparison is useless here: PDFs embed a creation timestamp and document ID,
so two identical requests never produce identical bytes. Responses are compared on
a structural fingerprint instead:

| Response       | Compared on                                                          |
|----------------|----------------------------------------------------------------------|
| any            | status code, content type, body size within 5%                       |
| PDF            | page count, encryption flag, per-page extracted-text hash            |
| ZIP / archive  | entry count, entry names, then each entry recursively                |
| JSON           | full body with ids/timestamps normalized away                        |
| anything else  | body hash                                                            |

The text hash is what makes cross-request bleed visible: a response carrying
another request's document has the right shape but the wrong text.

### Nondeterministic endpoints

Some endpoints legitimately vary between runs - Calibre stamps a fresh UUID into
EPUB metadata, LibreOffice timestamps ODF, and `scanner-effect` adds random noise
on purpose. These are handled automatically, not by tagging:

when a divergence is found, the request is replayed sequentially a few more times.
Any field that also varies across those uncontended runs is inherent noise and is
excluded; everything else is a genuine concurrency failure. Excluded fields are
listed in the end-of-run summary so the suppression is never silent.

### Cross-request bleed detection

```bash
CUCUMBER_PARALLEL=10 CUCUMBER_PARALLEL_DECOY=1 python -m behave
```

N identical requests alone cannot reveal two responses being swapped. With decoys
on, an equal number of concurrent requests carrying the *same structure but
different page text* run alongside. Page count and every parameter stay valid, so
the decoy exercises the same code path, but its output is distinguishable. A main
response matching the decoy's fingerprint is reported as cross-request bleed.

### Settings

| Variable                          | Default | Meaning                                        |
|-----------------------------------|---------|------------------------------------------------|
| `CUCUMBER_PARALLEL`               | off     | concurrent copies per operation                |
| `CUCUMBER_PARALLEL_HEAVY`         | 3       | cap for OCR/LibreOffice/Calibre/Ghostscript    |
| `CUCUMBER_PARALLEL_DECOY`         | off     | also run distinguishable decoy load            |
| `CUCUMBER_PARALLEL_STRICT`        | off     | require byte-identical responses               |
| `CUCUMBER_PARALLEL_SIZE_TOLERANCE`| 0.05    | allowed response-size drift                    |

Tags: `@noparallel` never repeats a scenario, `@parallel:N` overrides its count.
Heavy external-binary tags are throttled to `CUCUMBER_PARALLEL_HEAVY` so a CI
container is not starved by the repeat factor alone.

## 2. Suite-level shards

```bash
./run-parallel.sh 10
```

Splits the feature files round-robin across 10 concurrent behave processes against
one server. Each shard gets its own working directory because the step definitions
write generated input files into the CWD under fixed names.

Features that log in as the shared admin account are pinned to a single shard
rather than round-robined. `user_management.feature` changes the admin password
mid-scenario and reverts it, so any other shard authenticating during that window
gets a 401. That is test-suite state coupling, not a server concurrency problem;
keeping those features in one shard makes them sequential again. The runner
detects them by their auth steps and prints which ones it pinned.

Anything else that mutates shared server-side state should join that group, or the
scenario needs to stop depending on a global singleton.

Combine both layers for maximum contention:

```bash
CUCUMBER_PARALLEL=10 ./run-parallel.sh 10
```

Per-shard logs and JUnit XML land in `.parallel/reports/`.

## Nightly

The PR run keeps concurrency at 5 and leaves out the heavy endpoints. The
`cucumber-nightly` job in `.github/workflows/nightly.yml` covers the rest:
`@nightly` scenarios, then the full suite at `CUCUMBER_PARALLEL=10` with decoys
(which reaches the throttled endpoints too), then the 10-way shard run.

## Interpreting a failure

```
Parallel consistency failed for /api/v1/general/split-pages at concurrency 10.
Two sequential runs agreed on these fields, so the differences below are caused by
running the same operation concurrently.
  - copy 4/10 diverged: zip_entries: baseline=10 parallel=7
```

The endpoint is correct sequentially and wrong under load. Usual causes: a fixed
temp-file path shared between requests, a non-thread-safe native library, or
mutable state on a singleton bean.
