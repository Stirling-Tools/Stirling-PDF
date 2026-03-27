# Ledger Auditor — Manual Test Plan

## 1. Prerequisites

### 1.1 Environment variables

Create `engine/.env` (copy from `.env.example` if one exists, otherwise create fresh):

```bash
# Required — at least one must be set
STIRLING_ANTHROPIC_API_KEY=sk-ant-...
STIRLING_OPENAI_API_KEY=                  # leave blank if using Claude

# Model selection (choose models you have access to)
STIRLING_SMART_MODEL=claude-sonnet-4-6
STIRLING_FAST_MODEL=claude-haiku-4-5-20251001

# Model tuning (required by config.py even if unused)
STIRLING_SMART_MODEL_REASONING_EFFORT=medium
STIRLING_FAST_MODEL_REASONING_EFFORT=low
STIRLING_SMART_MODEL_TEXT_VERBOSITY=medium
STIRLING_FAST_MODEL_TEXT_VERBOSITY=low
STIRLING_SMART_MODEL_MAX_TOKENS=4096
STIRLING_FAST_MODEL_MAX_TOKENS=1024

# Flask
STIRLING_FLASK_DEBUG=1
STIRLING_OPENAI_BASE_URL=https://api.openai.com/v1

# Java connection (Python won't call Java, but config.py requires these)
STIRLING_JAVA_BACKEND_URL=http://localhost:8080
STIRLING_JAVA_BACKEND_API_KEY=
STIRLING_JAVA_REQUEST_TIMEOUT_SECONDS=30
```

### 1.2 Start the Python engine

```bash
cd engine
uv sync
cd src
flask --app app run --port 5001
```

Expected console output:
```
 * Running on http://127.0.0.1:5001
```

### 1.3 Start the Java backend (end-to-end tests only)

```bash
./gradlew :app:core:bootRun
```

Expected: Spring Boot starts on port `8080`. On first PDF upload, the log will show:
```
[ledger] math-validate request file=... tolerance=...
```

### 1.4 Run the automated suite first

Confirm the baseline is green before starting manual tests:

```bash
cd engine
uv run pytest tests/ledger/ -v
```

All 69 tests must pass before proceeding.

---

## 2. Python Engine — Direct API Tests

These test the Python layer in isolation. **Java is not required.**

### T-01 — Examine endpoint: text-only document

```bash
curl -s -X POST http://localhost:5001/api/ledger/examine \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-01",
    "page_count": 3,
    "folio_types": ["text", "text", "text"],
    "round": 1
  }' | jq .
```

**Expected:** `type: "requisition"`, `need_text` contains pages 0–2, `need_ocr` is empty, `rationale` is a non-empty string.

---

### T-02 — Examine endpoint: mixed document with image pages

```bash
curl -s -X POST http://localhost:5001/api/ledger/examine \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-02",
    "page_count": 4,
    "folio_types": ["text", "image", "mixed", "text"],
    "round": 1
  }' | jq .
```

**Expected:** `need_ocr` includes pages 1 and 2 (the image/mixed pages). `need_text` includes text pages.

---

### T-03 — Deliberate endpoint: clean document

```bash
curl -s -X POST http://localhost:5001/api/ledger/deliberate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-03",
    "folios": [
      {
        "page": 0,
        "text": "Invoice\nItem: Widget  £100.00\nItem: Gadget  £200.00\nTotal:        £300.00",
        "tables": ["Item,Amount\nWidget,100.00\nGadget,200.00\nTotal,300.00"]
      }
    ],
    "round": 2,
    "final_round": true,
    "unauditable_pages": []
  }' | jq .
```

**Expected:** `verdict.clean: true`, `verdict.discrepancies: []`, `summary` mentions no errors.

---

### T-04 — Deliberate endpoint: tally error

```bash
curl -s -X POST http://localhost:5001/api/ledger/deliberate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-04",
    "folios": [
      {
        "page": 0,
        "text": "Q1 Revenue: £500\nQ2 Revenue: £600\nAnnual Total: £1,050",
        "tables": ["Quarter,Revenue\nQ1,500\nQ2,600\nTotal,1050"]
      }
    ],
    "round": 2,
    "final_round": true,
    "unauditable_pages": []
  }' | jq .
```

**Expected:** `verdict.clean: false`, at least one discrepancy with `kind: "tally"`, `stated: "1050"`, `expected: "1100"`.

---

### T-05 — Deliberate endpoint: inline arithmetic error

```bash
curl -s -X POST http://localhost:5001/api/ledger/deliberate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-05",
    "folios": [
      {
        "page": 0,
        "text": "The project costs £450 + £350 = £750, which is within budget."
      }
    ],
    "round": 2,
    "final_round": true,
    "unauditable_pages": []
  }' | jq .
```

**Expected:** One discrepancy with `kind: "arithmetic"`, `stated: "750"`, `expected: "800"`.

---

### T-06 — Deliberate endpoint: cross-page consistency error

```bash
curl -s -X POST http://localhost:5001/api/ledger/deliberate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-06",
    "folios": [
      {
        "page": 0,
        "text": "Net Profit for the year was £45,000."
      },
      {
        "page": 3,
        "text": "As noted on the summary page, Net Profit was £42,000."
      }
    ],
    "round": 2,
    "final_round": true,
    "unauditable_pages": []
  }' | jq .
```

**Expected:** One discrepancy with `kind: "consistency"` referencing "net profit" on pages 0 and 3.

---

### T-07 — Deliberate endpoint: unauditable pages reported

```bash
curl -s -X POST http://localhost:5001/api/ledger/deliberate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-07",
    "folios": [
      {
        "page": 0,
        "text": "Page 0 text with Total: £500 + £500 = £1000"
      }
    ],
    "round": 2,
    "final_round": true,
    "unauditable_pages": [1, 2]
  }' | jq .
```

**Expected:** `verdict.unauditable_pages: [1, 2]`, `summary` mentions incomplete coverage.

---

### T-08 — Tolerance: rounding difference ignored

```bash
curl -s -X POST "http://localhost:5001/api/ledger/deliberate?tolerance=0.05" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "manual-08",
    "folios": [
      {
        "page": 0,
        "tables": ["Item,Amount\nA,33.33\nB,33.33\nC,33.33\nTotal,99.99"]
      }
    ],
    "round": 2,
    "final_round": true,
    "unauditable_pages": []
  }' | jq .
```

**Expected:** `verdict.clean: true` — the rounding difference is within the 0.05 tolerance.

---

### T-09 — Invalid manifest body rejected

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5001/api/ledger/examine \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** HTTP `400` or `500` — not `200`.

---

## 3. End-to-End Tests (Java + Python)

Both services must be running. Use a multipart POST to the Spring Boot endpoint.

### PDF fixtures to prepare

Create three simple PDF files — any tool (Word, LibreOffice, online editor) will do:

| File | Contents |
|---|---|
| `clean_invoice.pdf` | A 1-page invoice: 3 line items, correct subtotal, correct VAT, correct total |
| `bad_invoice.pdf` | Same layout but the "Total" cell is deliberately wrong by £50 |
| `scanned_page.pdf` | A 1-page image PDF (photograph or scanned document with numbers) |

---

### T-10 — End-to-end: clean invoice

```bash
curl -s -X POST http://localhost:8080/api/v1/ai/math-validate \
  -F "fileInput=@clean_invoice.pdf" \
  -F "tolerance=0.01" | jq .
```

**Expected:** `clean: true`, `discrepancies: []`, HTTP 200.

---

### T-11 — End-to-end: invoice with tally error

```bash
curl -s -X POST http://localhost:8080/api/v1/ai/math-validate \
  -F "fileInput=@bad_invoice.pdf" \
  -F "tolerance=0.01" | jq .
```

**Expected:** `clean: false`, at least one discrepancy with `kind: "tally"` and `severity: "error"`. The `stated` and `expected` values should match the deliberate error.

---

### T-12 — End-to-end: scanned (image) PDF

```bash
curl -s -X POST http://localhost:8080/api/v1/ai/math-validate \
  -F "fileInput=@scanned_page.pdf" \
  -F "tolerance=0.01" | jq .
```

**Expected:** HTTP 200. `verdict.unauditable_pages` contains the image page(s) — OCR is not yet wired, so graceful degradation is the correct outcome. `summary` should acknowledge incomplete coverage. This is expected behaviour, not a failure.

---

### T-13 — Java logs show correct session flow

After any end-to-end test, check the Spring Boot console for the sequence:

```
[ledger] audit started session=<uuid> file=...
[ledger] session=<uuid> requisition received: ...
[ledger] session=<uuid> fulfilled round 2 with N folios, 0 unauditable pages
[ledger] session=<uuid> verdict: N errors, N warnings, clean=...
```

**Expected:** All four log lines appear in order. No `NullPointerException` or `IllegalStateException`.

---

## 4. Error & Edge Case Tests

### T-14 — Tolerance boundary

Submit `bad_invoice.pdf` with a very high tolerance:

```bash
curl -s -X POST http://localhost:8080/api/v1/ai/math-validate \
  -F "fileInput=@bad_invoice.pdf" \
  -F "tolerance=100" | jq .
```

**Expected:** `clean: true` — the £50 error falls within the £100 tolerance.

---

### T-15 — Empty PDF

Upload a valid but blank PDF (no text, no images):

```bash
curl -s -X POST http://localhost:8080/api/v1/ai/math-validate \
  -F "fileInput=@blank.pdf" \
  -F "tolerance=0.01" | jq .
```

**Expected:** HTTP 200. `discrepancies: []`, `clean: true`, `pages_examined` empty or minimal. No crash.

---

### T-16 — Python engine down

Stop the Python engine (`Ctrl+C` in its terminal), then submit a PDF to Java:

```bash
curl -s -X POST http://localhost:8080/api/v1/ai/math-validate \
  -F "fileInput=@clean_invoice.pdf" \
  -F "tolerance=0.01"
```

**Expected:** Java returns an HTTP error (500 or 502) with a clear message. It must not hang indefinitely — `STIRLING_JAVA_REQUEST_TIMEOUT_SECONDS` governs the ceiling.

---

## 5. Pass / Fail Criteria

| # | Test | Pass condition |
|---|---|---|
| T-01 | Examine text doc | `need_ocr` empty; `need_text` populated |
| T-02 | Examine mixed doc | `need_ocr` contains image pages |
| T-03 | Deliberate clean | `clean: true`, no discrepancies |
| T-04 | Deliberate tally error | `kind: tally`, correct stated/expected |
| T-05 | Deliberate arithmetic error | `kind: arithmetic`, correct stated/expected |
| T-06 | Deliberate consistency error | `kind: consistency`, both pages cited |
| T-07 | Unauditable pages | `unauditable_pages` echoed in Verdict |
| T-08 | Tolerance respected | Rounding delta ignored when within tolerance |
| T-09 | Bad body rejected | Non-200 response |
| T-10 | E2E clean PDF | `clean: true` |
| T-11 | E2E bad PDF | `clean: false`, error surfaced |
| T-12 | E2E scanned PDF | Graceful degradation; unauditable pages noted |
| T-13 | Java log sequence | Four log lines in correct order |
| T-14 | High tolerance | Error swallowed by tolerance |
| T-15 | Empty PDF | No crash; clean result |
| T-16 | Python down | Java returns error, does not hang |
