from __future__ import annotations

from stirling.contracts import EditCannotDoResponse, PdfEditRequest, PdfEditResponse
from stirling.services.runtime import AppRuntime


class PdfEditAgent:
    def __init__(self, runtime: AppRuntime) -> None:
        self.runtime = runtime

    async def handle(self, request: PdfEditRequest) -> PdfEditResponse:
        return EditCannotDoResponse(reason=f"PDF edit handling is not implemented yet for: {request.user_message}")
