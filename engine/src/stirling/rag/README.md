# RAG Integration Guide

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

Collections are named buckets of indexed documents — think folders. By default an agent searches everything in the store. Pass `collections=` to restrict it to only the docs indexed under those names.

```python
from stirling.rag import RagCapability

# Only searches docs indexed under "company-docs" — ignores everything else
scoped = RagCapability(runtime.rag_service, collections=["company-docs"], top_k=3)

# Searches multiple collections
multi = RagCapability(runtime.rag_service, collections=["company-docs", "product-specs"])

# No collections arg = searches all collections in the store
everything = RagCapability(runtime.rag_service)
```

## Config (.env)

```
STIRLING_RAG_BACKEND=sqlite              # or "pgvector"
STIRLING_RAG_EMBEDDING_MODEL=voyageai:voyage-4
STIRLING_RAG_STORE_PATH=data/rag.db      # used when backend=sqlite
STIRLING_RAG_PGVECTOR_DSN=               # used when backend=pgvector
STIRLING_RAG_CHUNK_SIZE=512
STIRLING_RAG_CHUNK_OVERLAP=64
STIRLING_RAG_TOP_K=5
VOYAGE_API_KEY=your-key
```

## Backends

**`sqlite`** — Embedded sqlite-vec. Single `.db` file, zero ops. Ideal for dev and self-hosted deployments.

**`pgvector`** — External PostgreSQL with the `vector` extension. Point `STIRLING_RAG_PGVECTOR_DSN` at your Postgres instance.

Both backends implement the same `VectorStore` interface, so agents and the RAG service work identically regardless of which you pick.

For a self-hosted embedding server (e.g. Ollama, TEI, vLLM) set the model string accordingly and point at the server via its native env var:

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
| GET | `/api/v1/rag/status` | Report embedding model and existing collections |
| POST | `/api/v1/rag/index` | Index text into a collection |
| POST | `/api/v1/rag/search` | Search a collection |
| GET | `/api/v1/rag/collections` | List collections |
| DELETE | `/api/v1/rag/collections/{name}` | Delete a collection |
