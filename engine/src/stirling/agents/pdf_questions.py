from __future__ import annotations

from stirling.contracts import PdfQuestionNotFoundResponse, PdfQuestionRequest, PdfQuestionResponse
from stirling.services.runtime import AppRuntime


class PdfQuestionAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def handle(self, request: PdfQuestionRequest) -> PdfQuestionResponse:
        return PdfQuestionNotFoundResponse(
            reason=f"PDF question handling is not implemented yet for: {request.question}"
        )
