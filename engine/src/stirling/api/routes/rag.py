from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from stirling.api.dependencies import get_rag_embedding_model, get_rag_service
from stirling.rag.service import RagService

MAX_INDEX_TEXT_LENGTH = 1_000_000  # 1MB text limit per index request

_COLLECTION_NAME_RE = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]{1,61}[a-zA-Z0-9]$")


def _validate_collection_name(name: str) -> str:
    """Validate ChromaDB collection naming rules: 3-63 chars, alphanumeric + hyphens/underscores."""
    if not _COLLECTION_NAME_RE.match(name) or "--" in name or "__" in name:
        raise ValueError(
            "Collection name must be 3-63 characters, start/end with alphanumeric, "
            "and contain only letters, digits, hyphens, or underscores (no consecutive special chars)."
        )
    return name

router = APIRouter(prefix="/api/v1/rag", tags=["rag"])


# --- Request / Response models ---


class RagStatusResponse(BaseModel):
    enabled: bool
    embedding_model: str
    collections: list[str]


class RagIndexRequest(BaseModel):
    collection: str
    text: str = Field(max_length=MAX_INDEX_TEXT_LENGTH)
    source: str = ""
    metadata: dict[str, str] = Field(default_factory=dict)

    @field_validator("collection")
    @classmethod
    def validate_collection(cls, v: str) -> str:
        return _validate_collection_name(v)


class RagIndexResponse(BaseModel):
    collection: str
    chunks_indexed: int


class RagSearchRequest(BaseModel):
    query: str
    collection: str | None = None
    top_k: int = 5

    @field_validator("collection")
    @classmethod
    def validate_collection(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_collection_name(v)
        return v


class RagSearchResultItem(BaseModel):
    text: str
    source: str
    chunk_id: str
    score: float


class RagSearchResponse(BaseModel):
    query: str
    results: list[RagSearchResultItem]


class RagCollectionsResponse(BaseModel):
    collections: list[str]


# --- Endpoints ---


@router.get("/status", response_model=RagStatusResponse)
async def rag_status(
    rag: Annotated[RagService | None, Depends(get_rag_service)],
    embedding_model: Annotated[str, Depends(get_rag_embedding_model)],
) -> RagStatusResponse:
    if rag is None:
        return RagStatusResponse(enabled=False, embedding_model="", collections=[])
    collections = await rag.list_collections()
    return RagStatusResponse(enabled=True, embedding_model=embedding_model, collections=collections)


@router.post("/index", response_model=RagIndexResponse)
async def rag_index(
    request: RagIndexRequest,
    rag: Annotated[RagService | None, Depends(get_rag_service)],
) -> RagIndexResponse:
    if rag is None:
        raise HTTPException(status_code=503, detail="RAG is not enabled. Set STIRLING_RAG_ENABLED=true.")
    count = await rag.index_text(
        collection=request.collection,
        text=request.text,
        source=request.source,
        metadata=request.metadata,
    )
    return RagIndexResponse(collection=request.collection, chunks_indexed=count)


@router.post("/search", response_model=RagSearchResponse)
async def rag_search(
    request: RagSearchRequest,
    rag: Annotated[RagService | None, Depends(get_rag_service)],
) -> RagSearchResponse:
    if rag is None:
        raise HTTPException(status_code=503, detail="RAG is not enabled. Set STIRLING_RAG_ENABLED=true.")
    results = await rag.search(query=request.query, collection=request.collection, top_k=request.top_k)
    items = [
        RagSearchResultItem(
            text=r.document.text,
            source=r.document.metadata.get("source", ""),
            chunk_id=r.document.metadata.get("chunk_index", ""),
            score=r.score,
        )
        for r in results
    ]
    return RagSearchResponse(query=request.query, results=items)


@router.get("/collections", response_model=RagCollectionsResponse)
async def rag_collections(
    rag: Annotated[RagService | None, Depends(get_rag_service)],
) -> RagCollectionsResponse:
    if rag is None:
        return RagCollectionsResponse(collections=[])
    collections = await rag.list_collections()
    return RagCollectionsResponse(collections=collections)


@router.delete("/collections/{name}")
async def rag_delete_collection(
    name: str,
    rag: Annotated[RagService | None, Depends(get_rag_service)],
) -> dict[str, str]:
    if rag is None:
        raise HTTPException(status_code=503, detail="RAG is not enabled. Set STIRLING_RAG_ENABLED=true.")
    try:
        _validate_collection_name(name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    await rag.delete_collection(name)
    return {"status": "deleted", "collection": name}
