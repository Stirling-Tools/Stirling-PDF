from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.api.dependencies import get_document_service, require_user_id
from stirling.contracts import (
    DeleteDocumentResponse,
    IngestDocumentRequest,
    IngestDocumentResponse,
)
from stirling.contracts.documents import PurgeOwnerResponse
from stirling.documents import DocumentService
from stirling.models import FileId, OwnerId, PrincipalId, UserId

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


@router.post("", response_model=IngestDocumentResponse)
async def ingest_document(
    request: IngestDocumentRequest,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    _user_id: Annotated[UserId, Depends(require_user_id)],
) -> IngestDocumentResponse:
    """Replace-ingest a document's content under ``(owner_id, read_principals)``.

    Stores both representations in one shot:
      * embedded chunks for RAG search,
      * ordered page text for whole-document reading,
    plus the ACL row(s) that grant read access.

    ``owner_id`` and ``read_principals`` are required on the request body —
    the engine never defaults them. For personal uploads the caller sets
    both to its user id; for org-shared uploads it sets owner to the org
    and grantees to the target groups (``group:engineering``, etc.). We
    still require ``X-User-Id`` on the request so the caller is
    authenticated and PostHog tracks the right user.
    """
    chunks_indexed = await documents.ingest(
        collection=request.document_id,
        pages=request.page_text or [],
        source=request.source,
        owner_id=request.owner_id,
        read_principals=request.read_principals,
    )
    return IngestDocumentResponse(document_id=request.document_id, chunks_indexed=chunks_indexed)


@router.delete("/by-id/{document_id}", response_model=DeleteDocumentResponse)
async def delete_document(
    document_id: FileId,
    documents: Annotated[DocumentService, Depends(get_document_service)],
    user_id: Annotated[UserId, Depends(require_user_id)],
) -> DeleteDocumentResponse:
    """Remove the caller's copy of this document. Idempotent.

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
    """Delete every personal-doc collection owned by the caller. Idempotent.

    Called by Java on logout so a user's RAG content disappears as soon as
    the session ends. Org-owned docs (where the caller is a reader but not
    the owner) are not touched — only collections whose ``owner_id`` matches
    the calling user are removed.
    """
    deleted = await documents.purge_owner(OwnerId(user_id))
    return PurgeOwnerResponse(owner_id=OwnerId(user_id), deleted=deleted)
