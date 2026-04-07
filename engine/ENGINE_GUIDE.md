# Streaming Chat Agents — What This Branch Added

This document describes what the `feature/ai-agents` branch added to Stirling PDF. The engine already had agents, routes, contracts, and services on `main`. This branch layers a **streaming chat agent system** on top, connecting the frontend to AI-powered PDF workflows through Server-Sent Events (SSE).

---

## Table of Contents

1. [What Already Existed](#1-what-already-existed)
2. [What We Added](#2-what-we-added)
3. [The Streaming Chat Architecture](#3-the-streaming-chat-architecture)
4. [Communication Model — Who Owns What](#4-communication-model--who-owns-what)
5. [Python: EventEmitter and SSE Streaming](#5-python-eventemitter-and-sse-streaming)
6. [Python: Agent Registry](#6-python-agent-registry)
7. [Python: StreamingOrchestrator](#7-python-streamingorchestrator)
8. [Python: Chat Agents](#8-python-chat-agents)
9. [Python: Sub-Agents](#9-python-sub-agents)
10. [Python: Chat Contracts and Routes](#10-python-chat-contracts-and-routes)
11. [Java: SSE Proxy Layer](#11-java-sse-proxy-layer)
12. [Java: Spring Security and Async SSE](#12-java-spring-security-and-async-sse)
13. [Frontend: SSE Stream Client](#13-frontend-sse-stream-client)
14. [Frontend: PDF Text Extraction](#14-frontend-pdf-text-extraction)
15. [Frontend: Agent Action Execution](#15-frontend-agent-action-execution)
16. [Frontend: Chat State and Storage](#16-frontend-chat-state-and-storage)
17. [Frontend: UI Components](#17-frontend-ui-components)
18. [Dev Mode: Vite Proxy Configuration](#18-dev-mode-vite-proxy-configuration)
19. [Full Request Lifecycle](#19-full-request-lifecycle)
20. [How to Add a New Chat Agent](#20-how-to-add-a-new-chat-agent)
21. [Gotchas and Lessons Learned](#21-gotchas-and-lessons-learned)

---

## 1. What Already Existed

On `main`, the engine already had:

- **Agents**: `OrchestratorAgent`, `PdfEditAgent`, `PdfQuestionAgent`, `UserSpecAgent`, `ExecutionPlanningAgent`
- **Routes**: `agent_draft_router`, `execution_router`, `orchestrator_router`, `pdf_edit_router`, `pdf_question_router`
- **Contracts**: typed request/response models for each agent
- **Services**: `AppRuntime` with model loading, `AppSettings` for configuration
- **Models**: `ApiModel` base class, `tool_models.py` auto-generated from frontend definitions
- **Config**: environment-based model configuration (`STIRLING_SMART_MODEL`, `STIRLING_FAST_MODEL`, etc.)

These agents used a request/response pattern — the client sends a request, the server returns a result. None of them streamed.

---

## 2. What We Added

This branch introduces a **streaming chat agent system** that:

- accepts natural-language prompts from a chat UI
- routes them to the correct agent via an LLM-powered orchestrator
- streams progress and output back live via SSE
- emits structured actions the frontend can turn into real PDF operations

The changes span three layers:

| Layer | What was added |
|---|---|
| Python engine | `chat_agents/`, `sub_agents/`, `registry.py`, `streaming/`, `contracts/chat.py`, `routes/chat.py` |
| Java backend | `AgentChatController`, `EngineClientService`, `ChatRequest`, `AgentInfo` models, Spring Security async dispatch fix |
| Frontend | `agentStreamService`, `agentActionService`, `pdfTextExtractionService`, `chatStorage`, `AgentChatContext`, chat UI components, Vite SSE proxy config |

---

## 3. The Streaming Chat Architecture

There are three separate running processes. The chat flow in production:

```text
Browser
  -> Java backend (port 8080)    POST /api/v1/ai/chat/stream
  -> Python engine (port 5001)   POST /api/v1/chat/stream
  -> model provider (Anthropic/OpenAI/etc.)
```

SSE events flow back through the same path:

```text
Python engine (EventEmitter -> SSE)
  -> Java backend (re-emits SSE via SseEmitter)
  -> Browser (parses events, updates React state)
```

In dev mode, the Vite proxy sends `/api/v1/ai/*` requests directly to Python on port 5001, bypassing Java. See [Dev Mode: Vite Proxy Configuration](#18-dev-mode-vite-proxy-configuration) for details.

There is no persistent connection between requests. No WebSocket, no long-lived channel. Each chat turn is an independent HTTP request that opens an SSE stream, receives events, and closes.

---

## 4. Communication Model — Who Owns What

### Python is stateless

The Python engine has no session store, no database, and no memory of past requests. Each `POST /api/v1/chat/stream` creates a fresh `EventEmitter` and `run_id`. When the stream ends, everything is discarded.

The one exception is `StreamingOrchestrator._agents_cache`, which caches instantiated agent objects across requests to avoid re-creating them. This is a performance optimization, not conversation state.

### The frontend owns all state

The frontend is the source of truth for:

- **Conversation history** — stored in React state (`AgentChatContext`) during a session, persisted to IndexedDB (`chatStorage`) for cross-session survival
- **Document text** — extracted client-side via PDF.js before each request
- **Active files** — tracked in `FileContext`

### Context is replayed per request

On each new message, the frontend builds a `history` array from prior messages and sends it in the POST body alongside the new message. This is the same pattern most LLM chat APIs use — the client sends the full conversation each time.

```typescript
// Built from in-memory messages before each request
const history = messages
  .filter((m) => !m.isStreaming && m.content)
  .map((m) => ({ role: m.role, content: m.content }));
```

The orchestrator formats this into the routing prompt:

```python
def _format_history(self, request: ChatRequest) -> str:
    parts: list[str] = []
    for item in request.history:
        prefix = "User" if item.role == "user" else "Assistant"
        parts.append(f"{prefix}: {item.content}")
    parts.append(f"User: {request.message}")
    return "\n\n".join(parts)
```

### What each layer is responsible for

| Layer | Owns |
|---|---|
| Frontend | UI, file state, conversation history, text extraction, action approval |
| Java backend | Authentication, file I/O, PDF operations, public API surface |
| Python engine | Model access, orchestration, typed AI workflows |

---

## 5. Python: EventEmitter and SSE Streaming

**New files**: `engine/src/stirling/streaming/event_emitter.py`, `engine/src/stirling/streaming/sse.py`

The `EventEmitter` is a queue-based async event bus that agents write into. The SSE endpoint drains it.

```python
class EventEmitter:
    def __init__(self, run_id: str) -> None:
        self._queue: asyncio.Queue = asyncio.Queue()

    def agent_start(self, agent_name: str, parent_agent_id: str | None = None) -> str: ...
    def token(self, agent_id: str, delta: str) -> None: ...
    def agent_complete(self, agent_id: str, *, status: str, result_summary: str | None) -> None: ...
    def action_required(self, agent_id: str, action_type: str, action_payload: Any) -> None: ...
    def error(self, agent_id: str, error_message: str) -> None: ...
    def done(self) -> None: ...

    async def events(self):
        """Async generator yielding (event_type, json_data) tuples."""
```

The SSE helper wraps the emitter into a FastAPI `StreamingResponse`:

```python
async def _sse_generator(emitter: EventEmitter):
    async for event_type, json_data in emitter.events():
        yield f"event: {event_type}\ndata: {json_data}\n\n"

def create_sse_response(emitter: EventEmitter) -> StreamingResponse:
    return StreamingResponse(_sse_generator(emitter), media_type="text/event-stream", ...)
```

Event types on the wire:

| Event | Purpose |
|---|---|
| `agent_start` | An agent or sub-agent began executing |
| `token` | A text chunk streamed from the model |
| `agent_complete` | An agent finished (with status, duration, summary) |
| `action_required` | The agent wants the frontend to perform a product action |
| `error` | Something failed |
| `done` | Stream is finished |

Agents emit events without knowing anything about SSE or HTTP. That separation is the point.

---

## 6. Python: Agent Registry

**New file**: `engine/src/stirling/agents/registry.py`

The registry holds metadata for all chat agents and lets the orchestrator discover them dynamically.

```python
@dataclass(frozen=True)
class AgentMeta:
    agent_id: str
    name: str
    description: str
    category: str
    agent_factory: Callable[[AppRuntime], Any]

class AgentRegistry:
    def register(self, meta: AgentMeta) -> None: ...
    def get(self, agent_id: str) -> AgentMeta: ...
    def list_all(self) -> list[AgentMeta]: ...
```

Agents are registered at startup in `app.py`:

```python
registry = AgentRegistry()
registry.register(AgentMeta(
    agent_id="doc_summary",
    name="Document Summary",
    description="Summarize a PDF document, extracting key points and main topics.",
    category="analysis",
    agent_factory=DocSummaryAgent,
))
registry.register(AgentMeta(
    agent_id="auto_redact",
    name="Auto Redact",
    description="Detect sensitive information (PII, SSN, financial data) and auto-redact it.",
    category="security",
    agent_factory=AutoRedactAgent,
))
```

The orchestrator builds its routing prompt from the registry, so adding a new agent automatically makes it routable.

---

## 7. Python: StreamingOrchestrator

**New file**: `engine/src/stirling/agents/chat_agents/streaming_orchestrator.py`

The orchestrator is the first thing that runs on every chat request. It uses the fast model to classify the request and pick an agent.

```python
class StreamingOrchestrator:
    async def handle(self, request: ChatRequest, emitter: EventEmitter) -> None:
        orch_id = emitter.agent_start("Orchestrator")

        routing_agent = Agent(
            model=self.runtime.fast_model,
            output_type=NativeOutput([AgentSelection, UnsupportedRequest]),
            system_prompt=self._build_system_prompt(),  # built from registry
        )

        result = await routing_agent.run(prompt)

        if isinstance(result.output, UnsupportedRequest):
            emitter.token(orch_id, result.output.message)
            emitter.done()
            return

        agent = self._get_or_create_agent(result.output.agent_id)
        await agent.handle(request, emitter, parent_agent_id=orch_id)
        emitter.done()
```

Key details:
- Uses the **fast model** (routing is a classification problem, not a reasoning one)
- Includes file context and text availability in the routing prompt
- Caches agent instances to avoid repeated factory calls
- Handles conversation history for multi-turn chats

---

## 8. Python: Chat Agents

**New files**: `engine/src/stirling/agents/chat_agents/auto_redact.py`, `doc_summary.py`, `base.py`

Two chat agents ship in this branch:

### DocSummaryAgent

Composes: TextExtraction -> Summarization (streaming)

```python
class DocSummaryAgent:
    async def handle(self, request, emitter, parent_agent_id=None):
        agent_id = emitter.agent_start("Document Summary", parent_agent_id)
        text = await self.text_extraction.handle(request.extracted_text, emitter, agent_id)
        await self.summarization.handle(text, emitter, agent_id, user_instruction=request.message)
        emitter.agent_complete(agent_id, status="success", result_summary="Summary complete")
```

### AutoRedactAgent

Composes: TextExtraction -> SensitiveDataDetector -> action_required

```python
class AutoRedactAgent:
    async def handle(self, request, emitter, parent_agent_id=None):
        agent_id = emitter.agent_start("Auto Redact", parent_agent_id)
        text = await self.text_extraction.handle(request.extracted_text, emitter, agent_id)
        detection_result = await self.sensitive_detector.handle(text, emitter, agent_id, ...)

        if detection_result.matches:
            emitter.token(agent_id, "## Sensitive Data Detected\n...")
            emitter.action_required(agent_id, "auto_redact", {
                "matches": [...],
                "fileNames": request.file_names,
            })
```

The two output channels are:
- `token` — human-readable streamed text
- `action_required` — structured data the frontend can act on

The AI layer suggests the operation. The core backend still performs the actual PDF mutation.

---

## 9. Python: Sub-Agents

**New files**: `engine/src/stirling/agents/sub_agents/text_extraction.py`, `sensitive_data.py`, `summarization.py`

Sub-agents are reusable building blocks that chat agents compose.

### TextExtractionSubAgent

Validates the pre-extracted text from the frontend and reports word count. No model call. Currently a passthrough for text the frontend already extracted — future versions may call a backend API for server-side extraction.

### SensitiveDataDetector

Uses pydantic-ai with the smart model and typed output:

```python
class SensitiveDataDetector:
    def __init__(self, runtime):
        self.agent = Agent(
            model=runtime.smart_model,
            output_type=NativeOutput([SensitiveDataResult, NoSensitiveDataResult]),
            system_prompt=self.SYSTEM_PROMPT,
        )
```

Returns typed `SensitiveMatch` objects (text, category, confidence, indices) that the auto-redact agent forwards to the frontend. Supports both generic PII detection and user-specified content (e.g. "redact all dollar amounts").

### SummarizationSubAgent

Streams text token-by-token via `run_stream`:

```python
async with self.agent.run_stream(prompt) as stream:
    async for chunk in stream.stream_text(delta=True):
        emitter.token(agent_id, chunk)
```

---

## 10. Python: Chat Contracts and Routes

**New files**: `engine/src/stirling/contracts/chat.py`, `engine/src/stirling/api/routes/chat.py`

### Contracts

```python
class ChatHistoryItem(ApiModel):
    role: Literal["user", "assistant"]
    content: str

class ChatRequest(ApiModel):
    message: str
    conversation_id: str | None = None
    file_names: list[str] = Field(default_factory=list)
    extracted_text: str | None = None
    history: list[ChatHistoryItem] = Field(default_factory=list)
```

Uses the existing `ApiModel` base class for camelCase/snake_case conversion. The frontend sends camelCase; Python uses snake_case internally.

### Routes

Two new endpoints:

- `POST /api/v1/chat/stream` — creates an `EventEmitter`, launches the orchestrator in a background `asyncio` task, returns an SSE response that drains the emitter
- `GET /api/v1/chat/agents` — returns metadata for all registered agents

The route handler returns the SSE response immediately. The orchestrator runs concurrently and pushes events into the emitter's queue. If the orchestrator throws, the exception handler emits an `error` event followed by `done`, so the frontend always gets a clean stream termination.

### app.py changes

The lifespan function was extended to create the `AgentRegistry`, register both chat agents, and instantiate the `StreamingOrchestrator`. The chat router was added alongside the existing routers.

---

## 11. Java: SSE Proxy Layer

**New files**: `AgentChatController.java`, `EngineClientService.java`, `ChatRequest.java`, `AgentInfo.java`

The frontend does not call the Python engine directly in production. The Java backend exposes the public endpoints and proxies SSE through.

```java
@PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter chatStream(@RequestBody ChatRequest request) {
    SseEmitter emitter = new SseEmitter(5 * 60 * 1000L);
    Thread.ofVirtual().name("agent-chat-stream").start(() -> proxyStream(emitter, request));
    return emitter;
}
```

The `proxyStream` method opens an `InputStream` to the Python engine, reads SSE lines, parses them, and re-emits via `SseEmitter.event().name(eventType).data(payload)`.

`EngineClientService` uses `java.net.http.HttpClient` (built into Java 21) — no extra dependencies. The engine URL is configurable via `stirling.ai.engine.url` in `application.properties` (default: `http://localhost:5001`).

This keeps:
- authentication in the existing backend
- the Python engine internal-only (not exposed to the internet)
- the external API surface unified under one port

---

## 12. Java: Spring Security and Async SSE

**Modified file**: `SecurityConfiguration.java`

SSE endpoints require special handling with Spring Security. When an `SseEmitter` enters async mode, Spring re-dispatches the request with `DispatcherType.ASYNC`. Without explicit configuration, the security filter chain runs again on this async dispatch — but by then the response is already committed (SSE headers have been sent), causing `AuthorizationDeniedException` with "response already committed."

The fix:

```java
http.authorizeHttpRequests(
    authz ->
        authz
            // Allow async dispatches through — the initial request
            // already passed authentication.
            .dispatcherTypeMatchers(DispatcherType.ASYNC)
            .permitAll()
            .requestMatchers(...)
            .permitAll()
            .anyRequest()
            .authenticated());
```

This tells Spring to skip authorization on async dispatches. The initial request still requires full authentication (JWT or API key). This is the standard Spring Security pattern for SSE/async endpoints.

---

## 13. Frontend: SSE Stream Client

**New file**: `frontend/src/core/services/agentStreamService.ts`

Uses `fetch()` + `ReadableStream` instead of `EventSource` because the request is a POST with a JSON body (EventSource only supports GET).

```typescript
export function startAgentStream(options: StreamOptions): AbortController {
    const controller = new AbortController();

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...getAuthHeaders() },
        body: JSON.stringify({ message, fileNames, extractedText, history }),
        signal: controller.signal,
    })
    .then(response => readSSEStream(response.body, options))
    .catch(options.onError);

    return controller;
}
```

`readSSEStream` parses the text/event-stream format line-by-line and converts each event into a typed `ChatEvent` object. The parser uses `line.startsWith('event:')` with `substring(indexOf(':') + 1).trimStart()` to handle both `event: name` and `event:name` formats (Java's `SseEmitter` omits the space after the colon).

Also exposes `fetchAgentList()` for the `GET /api/v1/ai/agents` endpoint.

Returns an `AbortController` so the caller can cancel the stream mid-flight.

---

## 14. Frontend: PDF Text Extraction

**New file**: `frontend/src/core/services/pdfTextExtractionService.ts`

Extracts text client-side using PDF.js before sending to agents. This means the Python engine never needs to parse PDFs — it receives pre-extracted text in the request body.

```typescript
export async function extractTextFromFiles(files: File[]): Promise<string>
```

- Uses `pdfWorkerManager` to load documents (with proper cleanup via `destroyDocument`)
- Groups text by page with `--- Page N ---` markers
- Sorts text items by Y-coordinate (top-to-bottom in PDF coordinate space)
- For multiple files, prefixes each with `=== filename ===`
- Caches results per file signature to avoid re-extracting on each message

---

## 15. Frontend: Agent Action Execution

**New file**: `frontend/src/core/services/agentActionService.ts`

When an agent emits `action_required`, the frontend shows an approval UI. On approval, this service executes the action by calling existing Stirling API endpoints.

```typescript
export async function executeAgentAction(
    actionType: string,
    actionPayload: unknown,
    activeFiles: File[],
): Promise<ActionFileResult[]>
```

Currently handles:
- `auto_redact` — chains calls to `/api/v1/security/auto-redact`, one per text item. This one-at-a-time approach is necessary because Spring's `StrictHttpFirewall` rejects `\r\n` characters in multipart form values, and redaction texts can contain newlines. Each pass feeds the output PDF of the previous pass as input to the next.

Returns `ActionFileResult[]` with output blobs that replace the active files.

New action types are added as `case` branches in the switch statement.

---

## 16. Frontend: Chat State and Storage

### AgentChatContext

**New file**: `frontend/src/core/contexts/AgentChatContext.tsx`

Replaces the old `AgentContext`. This is the central state manager for the chat system.

Manages:
- **Messages** — both in-flight (streaming) and completed, stored in React state
- **Agent tree construction** — builds a tree of `AgentTreeNode` objects from SSE events, showing the orchestrator → agent → sub-agent hierarchy
- **Stream lifecycle** — `sendMessage()` opens the stream, `cancelStream()` aborts it
- **Action approval/denial** — with optional auto-accept memory per action type
- **Session management** — create, open, delete sessions; persists to IndexedDB

The `handleEvent` callback processes each `ChatEvent` from the SSE stream, updating the agent tree and message content in real time. On `done`, it finalizes the message by extracting content from the deepest agent node that produced output.

### Chat Storage

**New file**: `frontend/src/core/services/chatStorage.ts`

IndexedDB-backed persistence for chat sessions and messages. Database: `stirling-pdf-chats` v1.

- **`sessions` store** — conversation metadata (id, agentId, title, timestamps, lastMessage). Indexed by `agentId` and `updatedAt`.
- **`messages` store** — individual chat messages linked to a session. Indexed by `sessionId` and `timestamp`.
- Deletion is atomic — `deleteSession` removes the session record and all its messages in one transaction.
- Supports resuming past conversations by loading history back into `AgentChatContext`.

Uses the shared `indexedDBManager` for database lifecycle management.

### Types

**New file**: `frontend/src/core/types/agentChat.ts`

Defines `ChatMessage`, `AgentTreeNode`, `ChatEvent`, `AgentMeta`, and related types used across the chat system.

---

## 17. Frontend: UI Components

### New components added in this branch:

| Component | Location | Purpose |
|---|---|---|
| `AgentChat.tsx` | `rightPanel/` | Main chat UI — message list, streaming text, collapsible agent tree, action approval (Accept/Deny), quick-action chips, input bar |
| `ChatHistoryView.tsx` | `rightPanel/` | Lists past chat sessions for the current agent with relative timestamps, resume, and delete |
| `SimpleMarkdown.tsx` | `rightPanel/` | Lightweight markdown renderer (headings, bold, italic, code, lists) — no external dependencies |
| `ResizeHandle.tsx` | `shared/` | Generic drag-to-resize handle for sidebars (left/right, min/max constraints) |
| `AgentItem.tsx` | `rightPanel/` | Agent card in the agent list, shows name, description, icon |
| `RightPanel.tsx` | `rightPanel/` | Container — shows agent list by default, switches to chat view when an agent is selected |

### Modified components:

- `AppProviders.tsx` — replaced `AgentProvider` with `AgentChatProvider`
- `LeftSidebar.tsx` — added `ResizeHandle` for draggable sidebar width (180–500px)
- `agentRegistry.ts` — frontend agent metadata (icons, descriptions, quick-action prompts)

---

## 18. Dev Mode: Vite Proxy Configuration

**Modified file**: `frontend/vite.config.ts`

In development, the Vite dev server proxies API requests. The `/api/v1/ai/*` routes are handled specially:

```typescript
'/api/v1/ai': {
    target: 'http://localhost:5001',   // Direct to Python, bypass Java
    changeOrigin: true,
    rewrite: (path) => {
        // /api/v1/ai/chat/stream → /api/v1/chat/stream
        // /api/v1/ai/agents     → /api/v1/chat/agents
        const stripped = path.replace('/api/v1/ai/', '/api/v1/');
        return stripped.startsWith('/api/v1/chat') ? stripped : stripped.replace('/api/v1/', '/api/v1/chat/');
    },
    configure: (proxy) => {
        proxy.on('proxyRes', (proxyRes) => {
            if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
                delete proxyRes.headers['content-encoding'];
                proxyRes.headers['cache-control'] = 'no-cache';
                proxyRes.headers['connection'] = 'keep-alive';
            }
        });
    },
},
```

Key points:
- In dev, AI requests go **directly to Python** (port 5001), not through Java. This means the Spring Security async fix doesn't apply in dev.
- The `configure` hook strips `content-encoding` from SSE responses to prevent gzip buffering by the proxy, which would cause the stream to appear to hang.
- The URL rewrite strips the `/ai` segment because Java adds it as a namespace prefix (`/api/v1/ai/chat/stream`) but Python's router uses `/api/v1/chat/stream` directly.
- All other `/api/*` routes proxy to Java on port 8080 as usual.

In production, everything goes through Java. The Vite proxy only exists in dev.

---

## 19. Full Request Lifecycle

For a request like "Find and redact all PII":

### 1. Frontend extracts text

`pdfTextExtractionService.extractTextFromFiles()` runs PDF.js on the loaded documents client-side. Results are cached by file signature.

### 2. Frontend sends the request

`AgentChatContext.sendMessage()` builds the payload:

```json
{
  "message": "Find and redact all PII",
  "fileNames": ["contract.pdf"],
  "extractedText": "John Smith, born 01/01/1980, SSN 123-45-6789...",
  "history": [
    { "role": "user", "content": "previous message" },
    { "role": "assistant", "content": "previous response" }
  ]
}
```

Posted to `POST /api/v1/ai/chat/stream` via `startAgentStream()`. The frontend simultaneously persists the user message to IndexedDB.

### 3. Java authenticates and proxies to Python

The Java backend validates the JWT/API key on the initial request, then opens a virtual thread to proxy the SSE stream from the Python engine. Spring Security's async dispatch exemption allows the SSE events to flow without re-authentication.

(In dev mode, the Vite proxy sends the request directly to Python, skipping Java.)

### 4. Python creates an EventEmitter and launches the orchestrator

A new `EventEmitter` is created with a fresh `run_id`. The orchestrator is launched as a background `asyncio` task. The SSE response starts draining the emitter's queue immediately.

### 5. The orchestrator routes the request

`StreamingOrchestrator` emits `agent_start`, builds a routing prompt from the registry, and asks the fast model which agent should handle the request. The fast model returns a typed `AgentSelection` or `UnsupportedRequest`.

### 6. AutoRedactAgent runs its pipeline

The orchestrator delegates to `AutoRedactAgent`, which runs its sub-agent pipeline:

1. `TextExtractionSubAgent` — validates the pre-extracted text, reports word count
2. `SensitiveDataDetector` — runs the smart model with typed output, returns `SensitiveMatch` objects
3. The agent emits readable text via `token` and structured matches via `action_required`
4. Each step emits `agent_start` / `agent_complete`, building a visible tree in the UI

### 7. Events stream back to the browser

Every `emitter.*()` call is placed into the queue, serialized as SSE by the generator, proxied through Java (or Vite in dev), and received by `readSSEStream` in the browser. The `AgentChatContext.handleEvent` callback processes each event, updating the agent tree and message content in React state.

### 8. Frontend shows approval UI

The `action_required` event triggers an Accept/Deny prompt in the chat. The user can approve, deny, or deny with instructions (which sends a follow-up message).

### 9. On approval, the frontend calls the existing redaction API

`agentActionService.executeAutoRedact()` chains calls to `/api/v1/security/auto-redact`, one per detected text item. Each pass feeds the output of the previous pass as input. The result replaces the active file in `FileContext`.

The AI layer suggests the operation. The existing backend performs the actual PDF mutation.

---

## 20. How to Add a New Chat Agent

### 1. Create the agent class

```python
# engine/src/stirling/agents/chat_agents/translate.py
class TranslateAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.text_extraction = TextExtractionSubAgent()
        ...

    async def handle(self, request: ChatRequest, emitter: EventEmitter, parent_agent_id=None):
        agent_id = emitter.agent_start("Translate", parent_agent_id)
        # validate inputs, run model, stream text, emit actions
        emitter.agent_complete(agent_id, status="success", ...)
```

### 2. Export it

Add to `engine/src/stirling/agents/chat_agents/__init__.py`.

### 3. Register it in `app.py`

```python
registry.register(AgentMeta(
    agent_id="translate",
    name="Translate Document",
    description="Translate the document to a specified language.",
    category="editing",
    agent_factory=TranslateAgent,
))
```

The orchestrator automatically picks it up because the routing prompt is built from the registry. No orchestrator code changes needed.

### 4. (If the agent emits actions) Add a handler in `agentActionService.ts`

```typescript
case 'translate':
    return executeTranslate(actionPayload, activeFiles);
```

---

## 21. Gotchas and Lessons Learned

Things we ran into while building this that are worth knowing about:

### SSE parsing: space after the colon

Python's FastAPI generates `event: name\ndata: payload\n\n` (with a space). Java's `SseEmitter.event().name(x).data(y)` generates `event:name\ndata:payload\n\n` (no space). The SSE spec allows both. The frontend parser must handle both forms:

```typescript
// Correct — handles both "event: foo" and "event:foo"
if (line.startsWith('event:')) {
    currentEvent = line.substring(line.indexOf(':') + 1).trimStart();
}
```

### Spring Security and async SSE dispatches

Spring Security re-runs the authorization filter chain on `DispatcherType.ASYNC` dispatches. For SSE endpoints, the response is already committed by then (headers sent), so the auth failure throws `AuthorizationDeniedException` with "response already committed." The fix is `.dispatcherTypeMatchers(DispatcherType.ASYNC).permitAll()` in the security config. The initial request still requires full auth.

### Vite proxy and SSE buffering

The Vite dev proxy (`http-proxy`) can buffer SSE responses if `content-encoding` headers are present (e.g. gzip). This makes the stream appear to hang — the frontend gets a 200 but no events arrive until the connection closes. The fix is a `configure` hook that strips `content-encoding` from SSE responses.

### IndexedDB schema migrations

IndexedDB only runs `onupgradeneeded` when the version number increases. If a database was created during development with the wrong schema at version 1, subsequent opens at version 1 will silently use the broken schema. During dev, clearing the database (`indexedDB.deleteDatabase('stirling-pdf-chats')`) is the fix. In production, bump the version number when changing stores.

### Spring's StrictHttpFirewall and multipart values

Spring rejects `\r\n` in multipart form field values. The auto-redact action service works around this by sending one text item per API call rather than batching, and by sanitizing newlines before sending.

### URL namespace differences between Java and Python

Java exposes `/api/v1/ai/chat/stream` (namespaced under `/ai`). Python's router uses `/api/v1/chat/stream` (no `/ai` prefix). The Vite dev proxy rewrites the URL. In production, the Java controller handles the rewrite internally when proxying to Python.

---

## 22. Scalability & Performance Hardening

Recent changes added production-grade protections across the stack:

### Concurrency control (Java)

`AgentChatController` uses a `Semaphore(maxConcurrentStreams)` (default 50, configurable via `stirling.ai.max-concurrent-streams`). If the limit is reached, new requests are rejected immediately. The semaphore is released via `SseEmitter.onCompletion`, `onTimeout`, and `onError` callbacks.

### Input validation (Java + Python)

`ChatRequest` fields are constrained on both sides:
- `message`: max 10,000 chars (`@Size(max=10_000)` / `Field(max_length=10_000)`)
- `extractedText`: max 500,000 chars (~500KB)
- `fileNames`: max 50 items
- `history`: max 100 items (Python only)
- Java controller uses `@Valid` to enforce at the HTTP layer.

### EventEmitter backpressure (Python)

The `asyncio.Queue` is bounded (`maxsize=2000`). If the queue fills (slow SSE consumer), the producer drops the oldest event. The consumer has a 300-second timeout — if the producer crashes without calling `done()`, the SSE stream terminates cleanly instead of hanging forever.

### Background task lifecycle (Python)

`asyncio.create_task()` results are stored in a module-level `_background_tasks` set. Without this, Python's event loop holds only a weak reference, and the GC can collect the task mid-execution. Tasks self-remove via `add_done_callback(discard)`.

### Streaming render throttling (Frontend)

`updateStreamingMessage()` is throttled via `requestAnimationFrame`. Without this, every SSE `token` event (~20/sec) triggers a full `setMessages(prev => prev.map(...))` — creating a new array and re-rendering every message component. With rAF, updates coalesce to ~60fps.

### Action context stability (Frontend)

`handleAction` reads messages via `messagesRef.current` instead of the `messages` state closure. This removes `messages` from its dependency array, preventing the `actions` memo from recreating on every token — which would otherwise cause every `useAgentChatActions()` consumer to re-render during streaming.

### Performance instrumentation (Frontend)

`agentStreamService.ts` tracks Time-to-First-Token (TTFT) and token throughput (tok/s), logged at `console.debug` level. Visible in devtools but silent in production.

### Extracted text deduplication (Frontend)

Full PDF text is only sent on the first message of a session (or when files change). Subsequent messages in the same session omit `extractedText` since the backend has the context from conversation history.

### Error handling & retry (Frontend)

`agentActionService.ts` returns `{ successes, errors }` instead of throwing. Each redaction pass retries once on failure. Errors are shown inline in the chat with red styling. If all files fail, the action bar reverts to "pending" for retry.

### IndexedDB persistence of agent trees

Assistant messages are persisted with `agentTree`, `actionType`, `actionPayload`, and `actionDecision`. When loading history, the collapsible agent call tree and action approval state are fully restored.

### Agent isolation per session

Each agent starts with a fresh chat. Switching agents clears messages and session state. Previous sessions are accessible via the history view (clock icon) but never auto-loaded.
