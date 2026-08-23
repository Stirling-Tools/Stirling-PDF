# Document Storage

The `documents` package owns all stored content for a document under a single
`collection` (file id):

* **Vector chunks** — small, embedded chunks for RAG-style retrieval.
* **Ordered pages** — the original page text retained in document order, used
  for whole-document reading.

Both representations are populated by a single `ingest()` call and removed
together by `delete_collection()`.

## Adding RAG to an Agent

```python
from pydantic_ai import Agent

from stirling.services import AppRuntime

class MyAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        rag = runtime.rag_capability
        self.agent = Agent(
            model=runtime.smart_model,
            system_prompt="Your prompt here...",
            instructions=rag.instructions,
            toolsets=[rag.toolset],
        )
```

That's it. The agent gets a `search_knowledge` tool it can call autonomously.

## Scoping to Specific Collections

Collections are named buckets of indexed documents - think folders. By default
an agent searches everything in the store. Pass `collections=` to restrict it
to only the docs indexed under those names.

```python
from stirling.documents import RagCapability

# Only searches docs indexed under "company-docs"
scoped = RagCapability(runtime.documents, collections=["company-docs"], top_k=3)

# Searches multiple collections
multi = RagCapability(runtime.documents, collections=["company-docs", "product-specs"])

# No collections arg = searches all collections in the store
everything = RagCapability(runtime.documents)
```

## Config

Non-secret defaults live in the committed `engine/.env`:

```
STIRLING_DOCUMENTS_BACKEND=sqlite              # or "pgvector"
STIRLING_RAG_EMBEDDING_MODEL=voyageai:voyage-4
STIRLING_DOCUMENTS_SQLITE_PATH=data/rag.db      # used when backend=sqlite
STIRLING_DOCUMENTS_PGVECTOR_DSN=               # used when backend=pgvector
STIRLING_RAG_CHUNK_SIZE=512
STIRLING_RAG_CHUNK_OVERLAP=64
STIRLING_RAG_TOP_K=5
```

Provider credentials (and any local overrides) go in the uncommitted
`engine/.env.local`:

```
VOYAGE_API_KEY=your-key
```

### Embedding providers

`STIRLING_RAG_EMBEDDING_MODEL` takes a `provider:model` string. VoyageAI and
OpenAI are reached over their own APIs; anything exposing an OpenAI-compatible
`/v1/embeddings` endpoint (vLLM, Ollama, Text Embeddings Inference, llama.cpp)
is reached by pointing a base URL at it, which is how self-hosted models such as
Qwen3-Embedding are used:

```
STIRLING_RAG_EMBEDDING_MODEL=openai:Qwen/Qwen3-Embedding-0.6B
OPENAI_BASE_URL=http://vllm:8000/v1
```

`OPENAI_BASE_URL` is global and also redirects chat completions. To move only
embeddings, push `provider`, `api_key` and `base_url` through admin AI settings,
which routes to the same OpenAI-compatible client.

Ollama has its own provider prefix, and it reads its own base URL rather than
`OPENAI_BASE_URL`. Omitting `OLLAMA_BASE_URL` fails the first embed call, not
startup:

```
STIRLING_RAG_EMBEDDING_MODEL=ollama:nomic-embed-text
OLLAMA_BASE_URL=http://ollama:11434/v1
```

Model choice matters more than the wiring here. On a retrieval smoke test,
`nomic-embed-text` matched VoyageAI, while `qwen3-embedding:0.6b` served by
Ollama ranked a relevant passage last; validate a local embedder against your own
corpus before adopting it.

VoyageAI is spoken over its OpenAI-shaped REST API by
[`voyage.py`](voyage.py) rather than the `voyageai` SDK, whose import chain pulls
PIL, numpy, tokenizers and langchain for multimodal, local-inference and chunking
features this engine does not use.

## Backends

**`sqlite`** - Embedded sqlite-vec. Single `.db` file, zero ops. Ideal for dev
and self-hosted deployments.

**`pgvector`** - External PostgreSQL with the `vector` extension. Point
`STIRLING_DOCUMENTS_PGVECTOR_DSN` at your Postgres instance.

Both backends implement the same `DocumentStore` interface, so agents and the
service work identically regardless of which you pick.

For a self-hosted embedding server (e.g. Ollama, TEI, vLLM) set the model
string accordingly and point at the server via its native env var:

```
# Ollama running on another machine
STIRLING_RAG_EMBEDDING_MODEL=ollama:nomic-embed-text
OLLAMA_HOST=http://192.168.1.50:11434

# Any OpenAI-compatible embedding server
STIRLING_RAG_EMBEDDING_MODEL=openai:my-model
OPENAI_BASE_URL=http://192.168.1.50:8080/v1
```

## API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/documents` | Replace-ingest a document's pages |
| DELETE | `/api/v1/documents/{document_id}` | Delete a document's stored content |
