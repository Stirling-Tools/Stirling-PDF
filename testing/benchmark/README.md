# Stirling PDF resource benchmark

A reproducible harness that measures **CPU cost, memory, and maximum throughput per endpoint**, plus a
**CPU/RAM matrix** across container sizes. Use it to spot which tools need optimising and to size hardware,
and to compare release-over-release or hardware-over-hardware with consistent numbers.

Everything is driven from Docker cgroup counters (real CPU core-seconds and memory), not wall-clock guesses.

## Requirements

- Docker (Linux containers)
- Python 3.9+ (the runner creates a venv and installs `requirements.txt`)
- `curl`, `unzip`, `zip` on PATH (for `build` mode)

## Quick start

```bash
cd testing/benchmark

# Benchmark every endpoint on the published image at 4 vCPU / 8 GB
./run.sh single

# Open the result
#   report.html            visual report (CPU bands, optimisation candidates, full table)
#   endpoint_benchmark.csv raw per-endpoint data
```

## Comparing your own build

```bash
# 1. Build a patched image from the current source tree (tag: stirling-bench:local)
./run.sh build

# 2. Benchmark it
BENCH_IMAGE=stirling-bench:local ./run.sh single
```

Diff the new `endpoint_benchmark.csv` against a saved baseline to see what a change did to each tool.

## Different hardware

```bash
CPUS=8 RAM_GB=16 ./run.sh single          # one bigger box
./run.sh matrix                            # full CPU/RAM grid (edit CONFIGS in matrix.py)
```

`matrix.py`'s `CONFIGS` list is the grid — `(label, vCPU, RAM_GB)`. It boots each size, runs a
per-endpoint battery plus a concurrency ramp, and writes `camp_<label>.json` + `campaign_summary.json`.
To benchmark a real remote host instead of local Docker, point the scripts at its URL (see below).

## What it produces

| File | Contents |
|------|----------|
| `report.html` | Visual report: cost bands, top optimisation candidates, full table by category |
| `endpoint_benchmark.csv` | Per-endpoint CPU core-seconds, peak MB, latency, max req/s |
| `stress_full.json` | Raw per-endpoint single-request measurements |
| `throughput.json` | Raw per-endpoint max-throughput measurements |
| `camp_*.json` | Per-config matrix results (matrix mode) |

## How it works

1. `generate_fixtures.py` — deterministic test documents spanning cost classes and PDFBox cache tiers
   (text 10-3000pg, scanned, image-heavy 99-110 MB, vector, tables, forms, mixed) plus image/md/html/svg.
2. `catalog.py` — reads the live `/v1/api-docs` and auto-builds a request config for every file-processing
   endpoint (params from schema defaults, fixtures routed by input type). `OVERRIDES` handles endpoints that
   need a specific input or a structured JSON payload; `SKIP` documents what needs auth/state/special input.
3. `stress.py` — one request at a time per endpoint (median of 3): latency, CPU core-seconds, memory.
4. `throughput.py` — measured sustained max req/s per endpoint at concurrency = core count.
5. `report.py` — merges the two into `endpoint_benchmark.csv` and `report.html`.
6. `matrix.py` + `campaign.py` — the same battery across a CPU/RAM grid, resilient to container OOM-death
   (records the crash, restarts on a fresh port, continues).

## Coverage

Of ~103 file-processing endpoints, ~64 benchmark automatically. The rest are recorded but not timed because
they need a hand-crafted payload (redaction targets, find/replace ops, form-field edits, TOC, vector formats)
or special input/state (auth, signed PDFs, comic/ebook formats, AI, integrations). Add these by extending
`OVERRIDES` in `catalog.py`.

## Notes

- `report.html` is a standalone file — open it in a browser, or publish it as needed.
- Peak MB is the container high-water mark and includes page cache, so it overstates process memory for
  I/O-heavy tools; treat it as an upper bound. Heap growth for the heaviest tools belongs in a matrix run.
- Each endpoint uses one representative input at schema-default parameters (e.g. PDF→image at 300 DPI), so
  the numbers are one consistent comparison point, not a worst case. Change the fixture/params in
  `catalog.py` to profile other conditions.
- Exclude endpoints from the report with `BENCH_EXCLUDE=name1,name2 ./run.sh single`.
