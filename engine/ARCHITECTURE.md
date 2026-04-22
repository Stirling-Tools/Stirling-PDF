# AI Form Fill — Architecture

## Overview

The AI Form Fill system is a set of AI agents that analyse PDF forms, detect roles/sections, clean up field labels, and fill fields by matching them to user-provided knowledge (personal data, company info, etc). It runs as part of the Stirling AI Engine — a Python FastAPI service using pydantic-ai for LLM interactions.

The system is model-agnostic: any LLM that supports structured outputs works. Models are configured via environment variables (`STIRLING_SMART_MODEL`, `STIRLING_FAST_MODEL`).

## Agents

Three agents, each a class wrapping a pydantic-ai `Agent` with a system prompt and a structured output type.

### 1. FormAnalyserAgent (`agents/form_analyser.py`)

Analyses one or more PDF forms in a single LLM call so it has cross-document context.

| Model | Output Type | Purpose |
|-------|-------------|---------|
| smart | `FormAnalysisResponse` | Role detection + label cleanup + internal field detection across all files |

**What it does (analysis only — no filling):**
1. **Per-file role detection** — groups fields by section (Client, Beneficiary, Employee, etc.)
2. **Cross-file role merging** — "Client" in file A and "Applicant" in file B are the same conceptual role → merged into one `CrossFileRole`
3. **Label cleanup** — garbage field names (numeric codes, technical IDs) get real labels from nearby page text
4. **Internal field detection** — form IDs, submit buttons, tracking codes → `skipped_field_names`

**Prompt structure:**
```
=== FILE: invoice.pdf (id=abc123) ===
Page texts:
  [Page 0]: Client Information Name Address...
  [Page 1]: Beneficiary Details...
Fields:
- name=ClientFirstName, type=text
  label=ClientFirstName
  page=0
- name=BeneficiaryName, type=text
  label=BeneficiaryName
  page=1
...

=== FILE: nda.pdf (id=def456) ===
...

Detect roles per file, merge matching roles across files...
```

Page texts are deduplicated per file and truncated to 1500 chars each to control token usage.

### 2. FormFillerAgent (`agents/form_filler.py`)

Pure mechanical matching agent. Role detection is already done — it just matches fields to knowledge values.

| Model | Output Type | Purpose |
|-------|-------------|---------|
| **fast** | `FormFillBatchResponse` | Field-to-knowledge matching across N files |

Uses the **fast model** (not smart) because this is a simple matching task — no reasoning about form structure needed.

**Prompt structure:**
```
Known user information:
- first_name: John
- email: john@example.com
- company_name: Acme Corp

=== FILE abc123 (role: Client) ===
- name=ClientFirstName, type=text
  label=First Name
...

Match fields to knowledge entries. Return filled_fields per file.
```

### 3. DocumentExtractorAgent (`agents/document_extractor.py`)

Extracts structured personal information from document text (CV, ID, utility bill, etc). Two modes:

| Method | Output Type | Purpose |
|--------|-------------|---------|
| `extract_single` | `KnowledgeUpdateResponse` | Pull information from one document into key/value entries |
| `extract_multiple` | `DocumentExtractionResponse` | Pull information from N documents, grouping by detected person |

`extract_multiple` returns either a single `KnowledgeUpdateResponse` (one person across all docs) or a `MultiProfileExtractionResponse` (N distinct people grouped into profiles). Both modes avoid inferring facts not explicitly stated in the source text.

## API Endpoints

All under `POST /api/v1/form/ai/`:

| Endpoint | Agent | Purpose |
|----------|-------|---------|
| `POST /analyse` | FormAnalyserAgent | Multi-file form analysis (roles, labels, skipped fields) |
| `POST /fill-batch` | FormFillerAgent | Multi-file batch fill |
| `POST /extract` | DocumentExtractorAgent | Extract knowledge from documents (single or multi-person) |

Form fill is reachable only via these three endpoints. It is **not** wired as an orchestrator delegate — the frontend calls the engine directly via the `/engine-api` proxy.

## Data Flow

### Multi-File Batch Flow

```
Frontend                           Engine                              LLM
   │                                 │                                  │
   │ ① ANALYSE                       │                                  │
   │  POST /analyse                  │                                  │
   │  { files: [{fileId, fileName,   │                                  │
   │     formFields}] }              │                                  │
   │────────────────────────────────>│                                  │
   │                                 │  FormAnalyserAgent.analyse()     │
   │                                 │  (smart model, one call)         │
   │                                 │────────────────────────────────>│
   │                                 │                                  │
   │                                 │  FormAnalysisResponse:           │
   │                                 │  - per_file: roles, labels       │
   │                                 │  - cross_file_roles: merged      │
   │                                 │<────────────────────────────────│
   │<────────────────────────────────│                                  │
   │                                 │                                  │
   │  User assigns entities to roles │                                  │
   │  (frontend-only, no API call)   │                                  │
   │                                 │                                  │
   │ ② FILL                          │                                  │
   │  POST /fill-batch               │                                  │
   │  { files: [{fileId, formFields, │                                  │
   │     roleLabel}],                │                                  │
   │    knowledge: {merged dict} }   │                                  │
   │────────────────────────────────>│                                  │
   │                                 │  FormFillerAgent.fill_batch()    │
   │                                 │  (fast model)                    │
   │                                 │────────────────────────────────>│
   │                                 │                                  │
   │                                 │  FormFillBatchResponse:          │
   │                                 │  - per_file: [{fileId,           │
   │                                 │      filledFields}]              │
   │                                 │<────────────────────────────────│
   │<────────────────────────────────│                                  │
   │                                 │                                  │
   │  Frontend applies fills via     │                                  │
   │  Java backend /api/v1/form/fill │                                  │
```

Role confirmation is built into the UX: the user explicitly assigns entities to cross-file roles between ① and ② before fill is called. The engine never has to ask "are you the Client?" — by the time `fill-batch` runs, each file already carries its `roleLabel`.

### Document Knowledge Extraction Flow

```
Frontend                           Engine                              LLM
   │                                 │                                  │
   │  POST /extract                  │                                  │
   │  { documents: [{fileName,       │                                  │
   │     text}],                     │                                  │
   │    existingProfileNames }       │                                  │
   │────────────────────────────────>│                                  │
   │                                 │  DocumentExtractorAgent          │
   │                                 │  .extract_multiple()             │
   │                                 │  (smart model)                   │
   │                                 │────────────────────────────────>│
   │                                 │                                  │
   │                                 │  If 1 person detected:           │
   │                                 │    KnowledgeUpdateResponse       │
   │                                 │  If N people detected:           │
   │                                 │    MultiProfileExtractionResponse│
   │                                 │<────────────────────────────────│
   │<────────────────────────────────│                                  │
```

## Runtime & Model Configuration

```
engine/.env:
  STIRLING_SMART_MODEL=anthropic:claude-haiku-4-5
  STIRLING_FAST_MODEL=anthropic:claude-haiku-4-5
  STIRLING_SMART_MODEL_MAX_TOKENS=8192
  STIRLING_FAST_MODEL_MAX_TOKENS=2048
  ANTHROPIC_API_KEY=sk-ant-...
```

On startup, `build_runtime()` creates an `AppRuntime` with two model instances:
- **smart_model** — used by FormAnalyserAgent and DocumentExtractorAgent (reasoning-heavy tasks: role detection, label interpretation, document extraction)
- **fast_model** — used by FormFillerAgent and OrchestratorAgent (mechanical matching, routing)

Both models must support structured JSON schema outputs. This is validated at startup — the engine crashes immediately if a model doesn't support it.

All agents are instantiated once in the FastAPI lifespan and stored in `app.state`. They are stateless — no conversation memory, no persistent state. The frontend manages all state (entities, templates, analysis results).

### Where state actually lives

- **Engine:** in-memory only, per-request. Logs don't persist form content.
- **Frontend:** browser `localStorage` keys `stirling-pdf-ai-profiles` (entities/profiles containing PII) and `stirling-pdf-ai-workflows` (templates). These survive across sessions on the same browser but are not synced anywhere — no server, no cross-device sharing. Clearing browser storage wipes them. There is no user-scoping: multiple users sharing a browser share the same entity store.
- **Java backend:** PDF files and user accounts only — no form-fill entity data.

## Contract Design

All request/response models inherit from `ApiModel` which auto-converts between `snake_case` (Python) and `camelCase` (JSON/TypeScript).

`DocumentExtractionResponse` is a discriminated union on the `outcome` field:

```python
DocumentExtractionResponse = Annotated[
    KnowledgeUpdateResponse            # outcome="knowledge_update"
    | MultiProfileExtractionResponse,  # outcome="multi_profile_extraction"
    Field(discriminator="outcome"),
]
```

This lets the frontend `switch` on `response.outcome` with full type narrowing.

## How the AI Agents Interact with the Wider System

```
┌─────────────────────────────────────────────────────────┐
│                    Stirling AI Engine                     │
│                   (Python / FastAPI)                      │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Orchestrator  │  │ FormAnalyser │  │ PdfEdit       │  │
│  │ Agent         │  │ Agent        │  │ Agent         │  │
│  │ (fast model)  │  │ (smart model)│  │ (smart model) │  │
│  └──────┬───────┘  └──────────────┘  └───────────────┘  │
│         │                                                │
│         │ delegates    ┌──────────────┐  ┌────────────┐  │
│         └─────────────>│ DocumentExtr │  │ FormFiller  │  │
│                        │ actor Agent  │  │ Agent       │  │
│                        │ (smart model)│  │ (fast model)│  │
│                        └──────────────┘  └────────────┘  │
│                                                          │
│  All agents use pydantic-ai with NativeOutput or         │
│  ToolOutput for structured responses.                    │
└────────────────────┬────────────────────────────────────┘
                     │ FastAPI routes
                     │
┌────────────────────┴────────────────────────────────────┐
│              Frontend (React/TypeScript)                  │
│                                                          │
│  Calls AI Engine for analysis + fill                     │
│  Calls Java Backend for:                                 │
│    - Form field extraction (/api/v1/form/fields)         │
│    - PDF generation (/api/v1/form/fill)                  │
│                                                          │
│  Manages: entities, templates, state machines,           │
│  preview, passive learning — all client-side             │
└─────────────────────────────────────────────────────────┘
                     │
┌────────────────────┴────────────────────────────────────┐
│            Java Backend (Spring Boot)                     │
│                                                          │
│  PDFBox-based form field extraction + PDF generation     │
│  The AI engine never touches PDF files directly          │
└─────────────────────────────────────────────────────────┘
```

## Key Design Principles

1. **The engine is stateless.** No conversation memory, no storage, no database. The frontend owns all state. The engine does reasoning in, typed contracts out.

2. **The engine never touches PDF files.** PDF field extraction and PDF generation are done by the Java backend. The engine only receives field metadata (name, label, type, options) and returns fill values.

3. **Smart model for reasoning, fast model for matching.** Role detection, label interpretation, and document extraction need semantic understanding → smart model. Field-to-knowledge matching is mechanical → fast model. This halves the cost of the fill step.

4. **One AI call for analysis across all files.** The analyser sees all files together so it can merge matching roles across documents ("Client" in form A = "Applicant" in form B).

5. **Structured outputs everywhere.** Every agent returns a Pydantic model via `NativeOutput`. No free-text parsing, no regex extraction. The LLM produces valid JSON matching the schema or the call fails.

6. **Frontend merges entities, engine receives flat dict.** The entity system (person, company, site, etc.) is entirely frontend. The engine receives `knowledge: dict[str, str]` — a flat merged dictionary. This means zero engine changes when the entity model evolves.

7. **Role confirmation happens in the UI, not the engine.** The user picks which entity plays which role between analyse and fill. The engine never returns a "confirmation needed" response — every `fill-batch` call carries an explicit `roleLabel` per file.
