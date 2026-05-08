from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import DocumentExtractorAgent, FormAnalyserAgent, FormFillerAgent
from stirling.api.dependencies import (
    get_document_extractor_agent,
    get_form_analyser_agent,
    get_form_filler_agent,
)
from stirling.contracts.form_fill import (
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    FormAnalysisRequest,
    FormAnalysisWorkflowResponse,
    FormFillBatchRequest,
    FormFillBatchResponse,
)

router = APIRouter(prefix="/api/v1/form/ai", tags=["form-fill"])


@router.post("/analyse", response_model=FormAnalysisWorkflowResponse)
async def analyse_forms(
    request: FormAnalysisRequest,
    agent: Annotated[FormAnalyserAgent, Depends(get_form_analyser_agent)],
) -> FormAnalysisWorkflowResponse:
    return await agent.analyse(request)


@router.post("/fill-batch", response_model=FormFillBatchResponse)
async def fill_forms_batch(
    request: FormFillBatchRequest,
    agent: Annotated[FormFillerAgent, Depends(get_form_filler_agent)],
) -> FormFillBatchResponse:
    return await agent.fill_batch(request)


@router.post("/extract", response_model=DocumentExtractionResponse)
async def extract_from_documents(
    request: DocumentExtractionRequest,
    agent: Annotated[DocumentExtractorAgent, Depends(get_document_extractor_agent)],
) -> DocumentExtractionResponse:
    return await agent.extract_multiple(request)
