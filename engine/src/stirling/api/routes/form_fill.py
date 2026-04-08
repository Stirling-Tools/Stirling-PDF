from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from stirling.agents import FormAnalyserAgent, FormFillAgent, FormFillerAgent
from stirling.api.dependencies import get_form_analyser_agent, get_form_fill_agent, get_form_filler_agent
from stirling.contracts.form_fill import (
    DocumentExtractionRequest,
    DocumentExtractionResponse,
    FormAnalysisRequest,
    FormAnalysisResponse,
    FormFillBatchRequest,
    FormFillBatchResponse,
    FormFillRequest,
    FormFillResponse,
)

router = APIRouter(prefix="/api/v1/form/ai", tags=["form-fill"])


@router.post("", response_model=FormFillResponse)
async def form_fill(
    request: FormFillRequest,
    agent: Annotated[FormFillAgent, Depends(get_form_fill_agent)],
) -> FormFillResponse:
    return await agent.handle(request)


@router.post("/extract", response_model=DocumentExtractionResponse)
async def extract_from_documents(
    request: DocumentExtractionRequest,
    agent: Annotated[FormFillAgent, Depends(get_form_fill_agent)],
) -> DocumentExtractionResponse:
    return await agent.extract_documents(request)


@router.post("/analyse", response_model=FormAnalysisResponse)
async def analyse_forms(
    request: FormAnalysisRequest,
    agent: Annotated[FormAnalyserAgent, Depends(get_form_analyser_agent)],
) -> FormAnalysisResponse:
    return await agent.analyse(request)


@router.post("/fill-batch", response_model=FormFillBatchResponse)
async def fill_forms_batch(
    request: FormFillBatchRequest,
    agent: Annotated[FormFillerAgent, Depends(get_form_filler_agent)],
) -> FormFillBatchResponse:
    return await agent.fill_batch(request)
