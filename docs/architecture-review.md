# Ledger Auditor — Architectural Review

## Context

Review of the `feat/math-validation-agent` branch. The feature adds an AI-powered math validation agent that audits PDFs for arithmetic, tally, and cross-page consistency errors. It spans two codebases: **Java (Spring Boot)** orchestrates PDF extraction and state; **Python (Flask + pydantic-ai)** hosts the AI agents that reason about the content.

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
                                                          LedgerExaminer (fast model)
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
                                                          LedgerAuditor (smart model)
                                                          |-- check_tally()
                                                          |-- scan_arithmetic()
                                                          |-- register_figure()
                                                          +-- check_figure_consistency()
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

### Per-Request State (Python side — `AuditContext`)

| State | Lifecycle | Where |
|-------|-----------|-------|
| `evidence` | Immutable, received from Java | `AuditContext.evidence` |
| `figure_registry` | Mutable, accumulates across tool calls within one `audit()` | `AuditContext.figure_registry` (FigureTracker) |
| `tolerance` | Immutable | `AuditContext.tolerance` |
| `slog` (SessionLogger) | Created per audit call if trace logging enabled | `AuditContext.slog` |

**Critical observation:** Python is **stateless between HTTP calls**. Each `/deliberate` call gets a fresh `AuditContext`. The `FigureTracker` only accumulates figures within a single round — it does NOT carry over between rounds. This means cross-page consistency checking only works within a single deliberation round, not across rounds.

---

## 3. The Two-Agent Pattern

### LedgerExaminer (Fast, Cheap — Round 1 only)
- **Model:** `claude-haiku-4-5` or `gpt-5-mini`
- **Input:** `FolioManifest` (page types)
- **Output:** `Requisition` (what to extract)
- **Purpose:** Triage. Decides which pages need text, tables, or OCR. Keeps Round 1 cheap.

### LedgerAuditor (Smart, Expensive — Round 2+)
- **Model:** `claude-sonnet-4-5` or `gpt-5`
- **Input:** `Evidence` (extracted content) via `AuditContext`
- **Output:** `Verdict` (findings)
- **Tools available:**

| Tool | What it does | Deterministic? |
|------|-------------|----------------|
| `check_tally(page, table_csv, ...)` | Validates row/column sums in CSV tables | Yes — `Decimal` arithmetic |
| `scan_arithmetic(page, text)` | Regex-based inline expression checker (e.g. `100 + 200 = 300`) | Yes — regex + `Decimal` |
| `register_figure(label, value_str, page, raw)` | Records named figures for cross-page checking | N/A (accumulator) |
| `check_figure_consistency()` | Finds figures with conflicting values across pages | Yes — label normalization + `Decimal` comparison |

**The tools do the real math; the LLM decides when/how to call them.** The validators (`TallyChecker`, `ArithmeticScanner`, `FigureTracker`) are pure deterministic code using `Decimal` arithmetic — no LLM involved in the actual number crunching.

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
| `DiscrepancyKind` | `tally`, `arithmetic`, `consistency` | Error category |
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
| `model/api/ai/*.java` | All wire protocol DTOs (records) |

### Python

| File | Purpose |
|------|---------|
| `engine/src/ledger/routes.py` | Flask blueprint: `/api/ledger/examine` + `/api/ledger/deliberate` |
| `engine/src/ledger/agent.py` | Two pydantic-ai agents + 4 tool definitions |
| `engine/src/ledger/deps.py` | `AuditContext` dataclass (dependency injection) |
| `engine/src/ledger/prompts.py` | System prompts for Examiner and Auditor |
| `engine/src/ledger/models.py` | Pydantic models mirroring Java DTOs |
| `engine/src/ledger/validators/tally.py` | CSV table sum validation |
| `engine/src/ledger/validators/arithmetic.py` | Inline expression validation |
| `engine/src/ledger/validators/figures.py` | Cross-page figure consistency |
| `engine/src/config.py` | Model selection, token limits, logging config |
| `engine/src/ai_logging.py` | Per-session trace logging |

---

## 6. Expandability for Future Agents

### The pattern to replicate

Each new agent type needs:

**Python side** — new directory under `engine/src/{agent_name}/`:
```
{agent_name}/
  routes.py      -- Flask blueprint with endpoints
  agent.py       -- pydantic-ai Agent(s) with tools
  deps.py        -- context/dependency dataclass
  prompts.py     -- system prompts
  models.py      -- wire protocol Pydantic models
  validators/    -- deterministic validation logic
```
Register routes in `engine/src/app.py`.

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
| `FolioManifest` / `FolioType` (page classification) | Agent tools and validators |
| PDF extraction utilities (text, tables) | System prompts |
| `SessionLogger` / `ai_logging.py` | Wire protocol models beyond Folio |
| Config infrastructure (`config.py`, model selection) | Controller endpoint |
| Docker/deployment setup | Domain-specific tolerance/params |

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
   - **Examiner** (Haiku) returns `Requisition{need_text: [0,1,2], need_tables: [0,1], rationale: "Pages 0-1 appear to have tabular data"}`
4. **Orchestrator Round 2:**
   - Extracts text for pages 0,1,2 via PDFBox
   - Extracts tables for pages 0,1 via Tabula as CSV strings
   - Builds `Evidence{folios: [...], round: 2, final_round: false}`
   - Sends to `/deliberate?tolerance=0.01`
   - **Auditor** (Sonnet) creates `AuditContext`, calls tools:
     - `check_tally(0, csv_data)` -> finds column sum mismatch: stated 5000, actual 4850
     - `scan_arithmetic(0, text)` -> no inline expressions found
     - `register_figure("Total Revenue", "5000", 0, "Total Revenue: 5,000")`
     - `register_figure("Total Revenue", "4850", 2, "Revenue brought forward: 4,850")`
     - `check_figure_consistency()` -> WARNING: "Total Revenue" conflicting values
   - Returns `Verdict{clean: false, discrepancies: [tally_error, consistency_warning], ...}`
5. **Orchestrator** sees `AgentTurn.isFinal() == true`, returns Verdict
6. **Controller** returns JSON to client

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Image-only pages | Classified as `IMAGE`, examiner requests OCR, Java marks unauditable, auditor works with available pages |
| Round 3 forced final | `final_round=true` sent, auditor must commit to Verdict with current evidence |
| Empty requisition | Orchestrator enters deliberation with empty evidence |
| Python returns error | Spring `RestTemplate` throws `HttpClientErrorException`, propagates to client |
| Python returns requisition on final round | Java throws `IllegalStateException` |

---

## 8. Testing Infrastructure

| Asset | Location | Purpose |
|-------|----------|---------|
| 5 test PDFs | `testing/ledger/generate_test_pdfs.py` | Clean, tally error, arithmetic error, consistency error, mixed |
| Postman collection | `testing/ledger/Ledger_Auditor_API.postman_collection.json` | 9 automated API tests |
| Manual test plan | `testing/ledger/ledger-auditor-manual-test-plan.md` | 16 test cases (T-01 to T-16) |
| Session logs | `engine/src/logs/ai_sessions/` | Trace-level per-session AI interaction logs |

---

## 9. Configuration

### Java (`application.properties`)
```properties
stirling.ai.engine.url=${STIRLING_AI_ENGINE_URL:http://localhost:5001}
```

### Python (`engine/config/.env`)
| Variable | Default | Purpose |
|----------|---------|---------|
| `STIRLING_SMART_MODEL` | `claude-sonnet-4-5-20250929` | Auditor model |
| `STIRLING_FAST_MODEL` | `claude-haiku-4-5-20251001` | Examiner model |
| `STIRLING_AI_LOG_LEVEL` | `info` | `info` / `debug` / `trace` |
| `STIRLING_SMART_MODEL_MAX_TOKENS` | `8192` | Auditor token limit |
| `STIRLING_FAST_MODEL_MAX_TOKENS` | `2048` | Examiner token limit |
| `STIRLING_ANTHROPIC_API_KEY` | — | Claude API key |
| `STIRLING_OPENAI_API_KEY` | — | GPT API key (alternative) |
