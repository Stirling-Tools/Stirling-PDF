# Stirling PDF AI: LaTeX-First Design Plan

## End Goal
Build a "Create with AI" experience inside Stirling PDF that matches the UX in `AI.pdf`: a staged
workflow with Outline -> Rough Draft -> Polished Template -> Share. The backend remains Java as the
source of truth. A Python LangChain service runs alongside Java and generates LaTeX. The frontend is
Vite React.

The system must:
- Keep LaTeX templates as the output format (not JSON templates).
- Store AI session state in Java (not in Python).
- Stream "typing" behavior and stage transitions to the UI.
- Provide a share-first flow (link by default, optional email).

## Core Architecture
Java API (source of truth)
- Authentication, tenancy, rate limits.
- Session storage and state transitions.
- Template registry and ownership.
- File storage and "Saved" docs.
- Share links and email.

Python LangChain service (AI orchestrator)
- Runs a durable, resumable workflow using LangGraph.
- Generates LaTeX for Outline, Draft, and Polished stages.
- Uses Java endpoints as tools for saving, sharing, and template retrieval.
- Streams SSE events to the frontend (via Java proxy).

Vite React frontend
- Implements the UX from `AI.pdf`.
- Consumes SSE for live typing and stage transitions.
- Allows outline editing and "Approve and Continue."

## UX Stages (matches `AI.pdf`)
Stage 1: Outline
- UI shows outline with section titles and short details.
- User can edit any section.
- "Approve and Continue" triggers the next stage.
- Input box remains visible for reprompt.

Stage 2: Rough Draft
- AI fills a full rough draft from the approved outline.
- Typing animation is fast.
- Input box is hidden at top per spec.

Stage 3: Polished Template
- AI applies a LaTeX template for the chosen doc type.
- Style edits allowed, substance locked unless full redraft.
- Company templates available (pro tier).

Stage 4: Share
- Default is a share link.
- Optional email send.

## Data Model (Java)
Session
- session_id
- user_id
- team_id
- doc_type
- prompt_initial
- outline_text
- outline_approved: boolean
- draft_latex
- polished_latex
- template_id
- status: OUTLINE_PENDING | OUTLINE_APPROVED | DRAFT_READY | POLISHED_READY | SAVED | SHARED
- created_at
- updated_at

Templates
- template_id
- owner_id or team_id
- doc_type
- latex_source
- created_at
- updated_at

## LaTeX Template Strategy
Templates are pure LaTeX files with placeholder markers.
- Example marker convention: `<<SECTION_NAME>>`.
- "ApplyTemplate" step replaces placeholders using LLM or a strict prompt.
- Draft output is minimal LaTeX.
- Polished output is full template LaTeX.

LLM prompt rule:
- "Only replace placeholders, do not alter layout commands unless explicitly allowed."

## API Contracts
Frontend -> Java (public)
- POST /ai/sessions
  body: { prompt, docType?, templateId? }
  returns: { sessionId }
- GET /ai/sessions/:id/stream
  SSE proxy from Python
- POST /ai/sessions/:id/outline
  body: { outlineText }
- POST /ai/sessions/:id/reprompt
  body: { prompt }
- POST /ai/sessions/:id/share
  body: { email? }

Python -> Java (internal tools)
- GET /internal/ai/templates/:docType
  returns: { templateId, latex }
- POST /internal/ai/sessions/:id/update
  body: { phase, outlineText?, draftLatex?, polishedLatex? }
- POST /internal/ai/sessions/:id/save
  body: { polishedLatex, docType }
  returns: { docId, shareLink }

## SSE Event Schema
SSE events for UI animation and stage transitions.
- phase_changed
  data: { phase: "outline" | "draft" | "polish" | "share" }
- latex_delta
  data: { phase, delta }
- outline_ready
  data: { outlineText }
- phase_complete
  data: { phase, latex? }
- save_complete
  data: { docId, shareLink }

Frontend behaviors:
- "typing" uses latex_delta chunks.
- phase transitions animate per `AI.pdf`.

## LangGraph Flow (Python)
Nodes
- ClassifyDocType
- GenerateOutline
- WaitForOutlineApproval
- GenerateDraft
- ApplyTemplate
- SaveAndReturn

State
- sessionId
- userId
- docType
- prompt
- outlineText
- draftLatex
- polishedLatex
- templateId

All persistence writes happen by calling Java.

## Security Model
- Frontend authenticates only to Java.
- Java proxies SSE and mints internal tokens for Python.
- Python calls internal Java endpoints with internal auth.
- Java validates permissions and ownership.

## Implementation Stages
Phase 1: Skeleton
- Stand up Python LangGraph service.
- Implement create session + outline generation.
- Add SSE streaming for outline stage.
- Store sessions in Java.

Phase 2: Draft + Polish
- Add draft generation from approved outline.
- Add template application with LaTeX placeholders.
- Stream typing for each stage.

Phase 3: Share + Save
- Java stores polished LaTeX + PDF.
- Share by link + optional email.

Phase 4: Hardening
- Rate limits on AI endpoints.
- Guardrails for documents that need factual accuracy.
- Basic regression tests for outline/draft outputs.

## Migration Notes From Existing AI Folder
The current AI-Document-Generator backend already streams LaTeX chunks and compiles PDFs. Keep that
flow but rewire it into the staged LangGraph workflow and make Java the system of record.

## Non-Goals
- JSON-based document templates.
- Storing session state in Python.
- Using a single-step prompt without stage gates.

## Success Criteria
- UX matches the `AI.pdf` outline/draft/polish/share flow.
- LaTeX templates drive final output.
- Java owns all sessions and storage.
- Streaming feels fluid and staged.
