# Ledger Auditor — Architectural Review

## Context

Review of the `feat/math-validation-agent` branch after merge with `main` and refactoring to a **deterministic-first audit pipeline**. The feature adds an AI-powered math validation agent that audits PDFs for arithmetic, tally, formula, and cross-page consistency errors. It spans two codebases: **Java (Spring Boot)** orchestrates PDF extraction and state; **Python (FastAPI + pydantic-ai)** hosts the AI agents and deterministic validators that reason about the content.

---

## 1. Java <> Python Communication Protocol

The system uses a **multi-round negotiation protocol** over HTTP. Java always initiates; Python never calls back.

```
                        Java (Orchestrator)                    Python (Engine)
                        ------------------                    ---------------
  Client POST -->  MathValidationController
                        |
                   AuditOrchestrator.audit()
                        |
  Round 1:         classifyPages() --- cheap PDFBox scan
                        |
                   FolioManifest ----------------------->  POST /api/ledger/examine
                   (page types: text/image/mixed)              |
                                                          Examiner agent (fast model)
                   Requisition  <------------------------     "I need text for pages 0,2
                   (need_text, need_tables, need_ocr)          and tables for page 0"
                        |
  Round 2-3:       fulfil(requisition)
                   |-- PDFBox text extraction
                   |-- Tabula table extraction
                   +-- OCR (not yet implemented -> unauditable)
                        |
                   Evidence ---------------------------->  POST /api/ledger/deliberate
                   (folios with text/tables, round #)          |
                                                          LedgerAuditorAgent pipeline:
                                                          1. ArithmeticScanner (deterministic)
                                                          2. LLM: formula inference + figure extraction (parallel)
                                                          3. FormulaEvaluator (deterministic)
                                                          4. FigureTracker (deterministic)
                                                          5. Summary agent (fast LLM)
                                                               |
                   AgentTurn <----------------------------    { verdict | requisition }
                        |
                   if verdict -> return to client
                   if requisition -> loop (max 3 rounds)
```

**Key design decisions:**
- **PDF never leaves Java.** Only structured text/CSV crosses the wire. This is a security and performance boundary.
- **Python decides what it needs.** Java doesn't speculatively extract everything — it only does work Python requests.
- **Hard cap of 3 rounds.** On round 3, `final_round=true` forces Python to commit to a Verdict with whatever evidence it has.
- **Deterministic-first pipeline.** Regex and decimal arithmetic run before any LLM calls. The LLM infers formulas and extracts figures; deterministic validators verify them.

---

## 2. State Management

### Per-Request State (Java side — `AuditOrchestrator`)

| State | Lifecycle | Where |
|-------|-----------|-------|
| `sessionId` (UUID) | Created once per `audit()` call | Passed to all Python calls; ties logs together |
| `PDDocument` | Loaded at start, held in memory through all rounds | Closed in finally block (implied by factory pattern) |
| `requisition` | Updated each round from Python's response | Local variable in the loop |
| `round` counter | Incremented 1->2->3; capped at MAX_ROUNDS when sent to Python | Local variable |
| Tolerance | Immutable per request | Forwarded as query param to `/deliberate` |

### Per-Request State (Python side — `LedgerAuditorAgent`)

The Python engine is **stateless between HTTP calls**. Each `/deliberate` call constructs a fresh pipeline run. The `FigureTracker` only accumulates figures within a single round — it does NOT carry over between rounds. Cross-page consistency checking only works within a single deliberation round, not across rounds.

---

## 3. The Deterministic-First Pipeline

The previous architecture used a two-agent pattern (Examiner + Auditor-with-tools). The current architecture replaces the tool-calling Auditor with a **5-step deterministic-first pipeline** inside `LedgerAuditorAgent`:

### Step 1: Arithmetic Scanning (deterministic, no LLM)
- `ArithmeticScanner` uses regex patterns to detect inline expressions (e.g. `100 + 200 = 300`) and totals (e.g. `Total: 450 (100 + 200 + 150)`)
- Returns `Discrepancy` objects for mismatches
- Uses `Decimal` arithmetic with configurable tolerance

### Step 2: Parallel LLM Calls (concurrent per-page)
Two LLM tasks run concurrently via `asyncio.gather()`:
- **Formula inference** (`_table_analyser` agent): inspects CSV tables and suggests verifiable formulas with scopes (`each_row`, `column_total`, `single_cell`)
- **Figure extraction** (`_figure_extractor` agent): extracts named numeric figures from page text for cross-page consistency

### Step 3: Formula Verification (deterministic, no LLM)
- `FormulaEvaluator` checks LLM-inferred formulas against actual table data
- Supports three scopes: `each_row`, `column_total`, `single_cell`
- Safe expression evaluation (no `eval()`)
- Syntax: `col3 = col1 * col2`, `cell(4,3) = sum(col3, 1-3)`

### Step 4: Figure Consistency (deterministic, no LLM)
- `FigureTracker` performs cross-page consistency checking
- Label normalization via regex
- Detects when the same named figure is stated differently on different pages

### Step 5: Summary Generation (fast LLM call)
- `_summary_agent` generates a human-readable summary of all findings
- Falls back to a programmatic summary if the LLM call fails

### Four Specialized pydantic-ai Agents

| Agent | Model | Input | Output | Purpose |
|-------|-------|-------|--------|---------|
| `_examiner` | fast | `FolioManifest` | `Requisition` | Triage: decides which pages need text, tables, or OCR |
| `_figure_extractor` | fast | Page text | Named figures | Extracts labelled numeric values for cross-page checking |
| `_table_analyser` | fast | CSV tables | Formula suggestions | Infers verifiable mathematical relationships in tables |
| `_summary_agent` | fast | Discrepancy list | Summary text | Generates human-readable audit summary |

All agents use the **fast model** tier. The LLM reasons about structure; deterministic validators do the math.

### Four Deterministic Validators

| Validator | What it does | Input |
|-----------|-------------|-------|
| `ArithmeticScanner` | Regex-based inline expression checker | Page text |
| `TallyChecker` | CSV row/column sum validation | Tabula CSV output |
| `FormulaEvaluator` | Verifies LLM-inferred formulas against table data | CSV + formula specs |
| `FigureTracker` | Cross-page figure consistency | Extracted named figures |

---

## 4. Data Models (Wire Contract)

### Java to Python

| Model | Endpoint | Purpose |
|-------|----------|---------|
| `FolioManifest` | `/examine` | Page count + per-page type classification |
| `Evidence` | `/deliberate` | Fulfilled extraction: text, CSV tables, OCR per page |

### Python to Java

| Model | Endpoint | Purpose |
|-------|----------|---------|
| `Requisition` | `/examine` | Shopping list: which pages need what extraction |
| `AgentTurn` | `/deliberate` | Discriminated union: either `Requisition` (need more) or `Verdict` (done) |
| `Verdict` | (inside AgentTurn) | Final report: discrepancies, coverage, summary |

### Shared Enums/Types

| Type | Values | Purpose |
|------|--------|---------|
| `FolioType` | `text`, `image`, `mixed` | Page classification from PDFBox scan |
| `DiscrepancyKind` | `tally`, `arithmetic`, `consistency`, `statement` | Error category |
| `Severity` | `error`, `warning` | Error vs informational |

All JSON uses **snake_case** on the wire. Java records use `@JsonProperty` annotations for mapping.

---

## 5. Key Files

### Java

| File | Purpose |
|------|---------|
| `controller/api/ai/MathValidationController.java` | `POST /api/v1/ai/math-validate` — accepts PDF + tolerance |
| `service/AuditOrchestrator.java` | Multi-round negotiation loop, PDF extraction (PDFBox + Tabula) |
| `service/AiEngineClient.java` | HTTP client for Python engine (`examine` + `deliberate`) |
| `config/AiEngineClientConfig.java` | `RestTemplate` bean |
| `model/api/ai/*.java` | All wire protocol DTOs (records): `FolioManifest`, `Requisition`, `Folio`, `Evidence`, `AuditDiscrepancy`, `Verdict`, `AgentTurn`, `FolioType` |

All Java files live under `app/core/src/main/java/stirling/software/SPDF/`.

### Python

| File | Purpose |
|------|---------|
| `stirling/api/app.py` | FastAPI application with lifespan startup |
| `stirling/api/routes/ledger.py` | Routes: `/api/ledger/examine` + `/api/ledger/deliberate` |
| `stirling/api/dependencies.py` | FastAPI `Depends()` injection for agents |
| `stirling/agents/ledger/agent.py` | `LedgerAuditorAgent`: 4 pydantic-ai agents + 5-step pipeline |
| `stirling/agents/ledger/prompts.py` | System prompts for Examiner, Figure Extractor, Table Analyser, Summary |
| `stirling/agents/ledger/models.py` | Pydantic models mirroring Java DTOs |
| `stirling/agents/ledger/session_log.py` | Per-session trace logging (`SessionLog`) |
| `stirling/agents/ledger/validators/arithmetic.py` | `ArithmeticScanner` — inline expression validation |
| `stirling/agents/ledger/validators/tally.py` | `TallyChecker` — CSV table sum validation |
| `stirling/agents/ledger/validators/formula.py` | `FormulaEvaluator` — LLM-inferred formula verification |
| `stirling/agents/ledger/validators/figures.py` | `FigureTracker` — cross-page figure consistency |
| `stirling/config/settings.py` | `AppSettings` (pydantic-settings, reads from `.env`) |
| `stirling/services/runtime.py` | `AppRuntime` dataclass holding Model objects and settings |

All Python files live under `engine/src/`.

---

## 6. Broader Engine Architecture

The Python engine is not ledger-specific. It hosts multiple AI agent domains:

```
engine/src/stirling/
├── agents/                    # AI reasoning modules
│   ├── ledger/                # Ledger auditor (this feature)
│   ├── orchestrator.py        # Routes requests to domain-specific agents
│   ├── execution.py           # Execution planning agent
│   ├── pdf_edit.py            # PDF modification agent
│   ├── pdf_questions.py       # PDF question-answering agent
│   └── user_spec.py           # User specification agent
├── api/                       # FastAPI routes & startup
│   ├── app.py                 # FastAPI app with lifespan
│   ├── dependencies.py        # Depends() injection
│   └── routes/                # One module per domain
├── contracts/                 # Request/response Pydantic models
├── models/                    # Base model types (ApiModel, OperationId)
├── services/                  # Shared runtime infrastructure
└── config/                    # AppSettings (pydantic-settings)
```

**Agent lifecycle:** All agents are instantiated once at startup (in `app.py` lifespan) and stored on `app.state`. FastAPI `Depends()` functions retrieve them per-request.

### The pattern to replicate for new agents

**Python side** — new directory under `engine/src/stirling/agents/{agent_name}/`:
```
{agent_name}/
  __init__.py
  agent.py       -- pydantic-ai Agent(s) or pipeline class
  models.py      -- wire protocol Pydantic models
  prompts.py     -- system prompts
  validators/    -- deterministic validation logic (if applicable)
```
Register routes in `stirling/api/routes/` and include in `app.py`.

**Java side:**
```
model/api/ai/   -- new DTOs for the wire protocol
service/        -- new orchestrator + client methods
controller/     -- new REST endpoint
```

### What's reusable vs. agent-specific

| Reusable | Agent-Specific |
|----------|----------------|
| `AiEngineClientConfig` (RestTemplate bean) | Orchestrator loop logic |
| `FolioManifest` / `FolioType` (page classification) | Agent pipeline and validators |
| PDF extraction utilities (text, tables) | System prompts |
| `SessionLog` / session logging | Wire protocol models beyond Folio |
| Config infrastructure (`AppSettings`, `AppRuntime`) | Controller endpoint |
| FastAPI dependency injection pattern | Domain-specific tolerance/params |

### Current limitations for expansion

1. **PDF extraction is embedded in `AuditOrchestrator`** — the `extractText()`, `extractTables()`, `classifyPages()` methods should be extracted into a shared service if multiple agents need PDF content.
2. **`AiEngineClient` is ledger-specific** — its methods (`examine`, `deliberate`) are hardcoded to ledger endpoints. A new agent would need either new methods or a more generic client.
3. **No agent registry/discovery** — each agent is wired up manually. For many agents, a registry pattern would help.
4. **OCR not implemented** — any agent needing image-based PDF content is blocked.

---

## 7. The Ledger Flow (End-to-End Example)

### Happy Path: Invoice with a tally error

1. **Client** uploads `invoice.pdf` with `tolerance=0.01`
2. **Controller** receives multipart form, delegates to orchestrator
3. **Orchestrator Round 1:**
   - Loads PDF, classifies 3 pages: `[text, text, text]`
   - Sends `FolioManifest{session_id: "abc", page_count: 3, folio_types: [text,text,text], round: 1}`
   - **Examiner** returns `Requisition{need_text: [0,1,2], need_tables: [0,1], rationale: "Pages 0-1 appear to have tabular data"}`
4. **Orchestrator Round 2:**
   - Extracts text for pages 0,1,2 via PDFBox
   - Extracts tables for pages 0,1 via Tabula as CSV strings
   - Builds `Evidence{folios: [...], round: 2, final_round: false}`
   - Sends to `/deliberate?tolerance=0.01`
   - **LedgerAuditorAgent** runs 5-step pipeline:
     1. `ArithmeticScanner` — scans all page text for inline expression errors
     2. `_figure_extractor` + `_table_analyser` — concurrent LLM calls per page
     3. `FormulaEvaluator` — checks inferred table formulas (e.g. column sum mismatch: stated 5000, actual 4850)
     4. `FigureTracker` — detects "Total Revenue" stated as 5,000 on page 0 but 4,850 on page 2
     5. `_summary_agent` — generates human-readable summary
   - Returns `Verdict{clean: false, discrepancies: [formula_error, consistency_warning], ...}`
5. **Orchestrator** sees `AgentTurn.isFinal() == true`, returns Verdict
6. **Controller** returns JSON to client

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Image-only pages | Classified as `IMAGE`, examiner requests OCR, Java marks unauditable, pipeline works with available pages |
| Round 3 forced final | `final_round=true` sent, pipeline must commit to Verdict with current evidence |
| Empty requisition | Orchestrator enters deliberation with empty evidence |
| Python returns error | Spring `RestTemplate` throws `HttpClientErrorException`, propagates to client |
| Python returns requisition on final round | Java throws `IllegalStateException` |
| Summary LLM fails | Falls back to programmatic summary generation |

---

## 8. Testing Infrastructure

| Asset | Location | Purpose |
|-------|----------|---------|
| Test PDFs | `testing/ledger/generate_test_pdfs.py` | Clean, tally error, arithmetic error, consistency error, mixed |
| Stress test PDF | `testing/ledger/stress_100_pages.pdf` | 100-page stress test |
| Combined test PDF | `testing/ledger/all_combined.pdf` | All error types combined |
| Postman collection | `testing/ledger/Ledger_Auditor_API.postman_collection.json` | Automated API tests |
| Manual test plan | `testing/ledger/ledger-auditor-manual-test-plan.md` | Test cases |
| Session logs | `engine/src/logs/ai_sessions/` | Trace-level per-session AI interaction logs |

---

## 9. Configuration

### Java (`application.properties`)
```properties
stirling.ai.engine.url=${STIRLING_AI_ENGINE_URL:http://localhost:5001}
```

### Python (`engine/.env` + `stirling/config/settings.py`)

Configuration uses **pydantic-settings** (`AppSettings`) which reads from `engine/.env`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `STIRLING_SMART_MODEL` | `anthropic:claude-haiku-4-5` | High-power model tier |
| `STIRLING_FAST_MODEL` | `anthropic:claude-haiku-4-5` | Fast model tier (used by all ledger agents) |
| `STIRLING_SMART_MODEL_MAX_TOKENS` | `8192` | Smart model token limit |
| `STIRLING_FAST_MODEL_MAX_TOKENS` | `2048` | Fast model token limit |
| `STIRLING_AI_LOG_LEVEL` | `info` | `info` / `debug` / `trace` |
| `ANTHROPIC_API_KEY` | — | Claude API key (read directly by pydantic-ai) |
| `OPENAI_API_KEY` | — | GPT API key (read directly by pydantic-ai) |

Model strings use the `provider:model` format (e.g. `anthropic:claude-haiku-4-5`). Any model that supports `json_schema` structured output is compatible.

### Runtime (`AppRuntime`)
```python
@dataclass(frozen=True)
class AppRuntime:
    settings: AppSettings
    fast_model: Model
    smart_model: Model
```
Built once at startup and shared across all agents.

---

## 10. Technology Stack (Python Engine)

| Component | Technology | Notes |
|-----------|-----------|-------|
| Web framework | **FastAPI** (was Flask) | Lifespan startup, `APIRouter`, `Depends()` |
| AI framework | **pydantic-ai** | Structured outputs, agent tool-calling |
| Data models | **Pydantic v2** | All wire contracts, `ApiModel` base class |
| Configuration | **pydantic-settings** | `.env` file + environment variable override |
| Python version | **3.13+** | Required minimum |
| Server | **Uvicorn** | ASGI server |
