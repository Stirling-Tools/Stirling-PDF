from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents.knowledge_ask import KnowledgeAskAgent, passage_from_hit
from stirling.api.dependencies import get_document_service, get_knowledge_ask_agent, require_user_id
from stirling.config import load_settings
from stirling.contracts import (
    DeleteDocumentResponse,
    IngestDocumentRequest,
    IngestDocumentResponse,
)
from stirling.contracts.documents import (
    AskDocumentsRequest,
    AskDocumentsResponse,
    DocumentStatsResponse,
    DocumentSummary,
    ListDocumentsResponse,
    PurgeOwnerResponse,
    SearchDocumentsRequest,
    SearchDocumentsResponse,
)
from stirling.documents import DocumentService
from stirling.models import FileId, OwnerId, PrincipalId, UserId

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])
logger = logging.getLogger(__name__)


@router.post("", response_model=IngestDocumentResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    _user_id: Annotated[UserId, Depends(require_user_id)],
) -> IngestDocumentResponse:
    """Replace-ingest a document's content under ``(owner_id, read_principals)``.

    ``owner_id`` and ``read_principals`` are required on the request body and
    are stored verbatim.

    ``X-User-Id`` is still required so the caller is authenticated and
    PostHog tracks the right user, but the value is not used to constrain
    the body.
    """
    chunks_indexed = await documents.ingest(
        collection=request.document_id,
        pages=request.page_text or [],
        source=request.source,
        owner_id=request.owner_id,
        read_principals=request.read_principals,
        expires_at=request.expires_at,
    )
    return IngestDocumentResponse(document_id=request.document_id, chunks_indexed=chunks_indexed)


@router.get("/stats", response_model=DocumentStatsResponse)
async def document_stats(
    documents: Annotated[DocumentService, Depends(get_document_service)],
    _user_id: Annotated[UserId, Depends(require_user_id)],
) -> DocumentStatsResponse:
    """Deployment-wide store counts for the admin dashboard.

    Not tenant-filtered: counts cover every owner's content, so this reports
    what the whole store holds, not what the caller can read.
    """
    settings = load_settings()
    counts = await documents.stats()
    return DocumentStatsResponse(
        backend=settings.documents_backend.value,
        documents=counts.documents,
        chunks=counts.chunks,
        embedding_model=settings.rag_embedding_model,
    )


@router.get("/list", response_model=ListDocumentsResponse)
async def list_documents(
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> ListDocumentsResponse:
    """Per-document rollup of what the caller can read: distinct document ids
    with their stored source label and chunk count. Never shows another
    principal's documents.
    """
    summaries = await documents.list_documents([PrincipalId(user_id)])
    return ListDocumentsResponse(
        documents=[
            DocumentSummary(document_id=FileId(s.collection), source=s.source, chunks=s.chunks) for s in summaries
        ]
    )


@router.post("/search", response_model=SearchDocumentsResponse)
async def search_documents(
    request: SearchDocumentsRequest,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> SearchDocumentsResponse:
    """Semantic search across every document the caller can read.

    Same retrieval path as the RAG toolset: embed the query, search the
    caller's readable collections, merge by score.
    """
    hits = await documents.search_with_collections(
        request.query, principals=[PrincipalId(user_id)], top_k=request.top_k
    )
    return SearchDocumentsResponse(passages=[passage_from_hit(hit) for hit in hits])


@router.post("/ask", response_model=AskDocumentsResponse)
async def ask_documents(
    request: AskDocumentsRequest,
    agent: Annotated[KnowledgeAskAgent, Depends(get_knowledge_ask_agent)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> AskDocumentsResponse:
    """Answer a question from the caller's stored documents with inline citations."""
    return await agent.ask(request, principals=[PrincipalId(user_id)])


@router.delete("/by-id/{document_id}", response_model=DeleteDocumentResponse)
async def delete_document(
    document_id: FileId,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> DeleteDocumentResponse:
    """Remove the caller's copy of this document.

    Owner is inferred from the caller - only personal-doc deletes go through
    here. Org-doc deletes will need an explicit owner_id once we add the
    admin endpoints for them; for now this route can't reach docs owned by
    a different principal.
    """
    owner_id = OwnerId(user_id)
    principals = [PrincipalId(user_id)]
    existed = await documents.has_collection(document_id, principals=principals)
    if existed:
        await documents.delete_collection(document_id, owner_id=owner_id)
    return DeleteDocumentResponse(document_id=document_id, deleted=existed)


@router.delete("/by-owner", response_model=PurgeOwnerResponse)
async def purge_caller_documents(
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> PurgeOwnerResponse:
    """Delete every personal-doc collection owned by the caller.

    Called by Java on logout so a user's document content disappears as soon as
    the session ends. Org-owned docs (where the caller is a reader but not
    the owner) are not touched - only collections whose ``owner_id`` matches
    the calling user are removed.
    """
    deleted = await documents.purge_owner(OwnerId(user_id))
    logger.info("Purged %d collection(s) for owner=%s", deleted, user_id)
    return PurgeOwnerResponse(owner_id=OwnerId(user_id), deleted=deleted)
