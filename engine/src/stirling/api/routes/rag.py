from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_rag_embedding_model, get_rag_service
from stirling.contracts import (
    RagCollectionsResponse,
    RagDeleteCollectionResponse,
    RagIndexRequest,
    RagIndexResponse,
    RagSearchRequest,
    RagSearchResponse,
    RagSearchResultItem,
    RagStatusResponse,
)
from stirling.rag import RagService

router = APIRouter(prefix="/api/v1/rag", tags=["rag"])


@router.get("/status", response_model=RagStatusResponse)
async def rag_status(
    rag: Annotated[RagService, Depends(get_rag_service)],
    embedding_model: Annotated[str, Depends(get_rag_embedding_model)],
) -> RagStatusResponse:
    collections = await rag.list_collections()
    return RagStatusResponse(embedding_model=embedding_model, collections=collections)


@router.post("/index", response_model=RagIndexResponse)
async def rag_index(
    request: RagIndexRequest,
    rag: Annotated[RagService, Depends(get_rag_service)],
) -> RagIndexResponse:
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
    rag: Annotated[RagService, Depends(get_rag_service)],
) -> RagSearchResponse:
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
    rag: Annotated[RagService, Depends(get_rag_service)],
) -> RagCollectionsResponse:
    collections = await rag.list_collections()
    return RagCollectionsResponse(collections=collections)


@router.delete("/collections/{name}", response_model=RagDeleteCollectionResponse)
async def rag_delete_collection(
    name: str,
    rag: Annotated[RagService, Depends(get_rag_service)],
) -> RagDeleteCollectionResponse:
    await rag.delete_collection(name)
    return RagDeleteCollectionResponse(status="deleted", collection=name)
