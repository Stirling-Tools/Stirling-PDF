from __future__ import annotations

from typing import Protocol

from stirling.models import ApiModel, OperationId, ParamToolModel


class JavaToolCall(ApiModel):
    tool: OperationId
    parameters: ParamToolModel


class JavaToolResult(ApiModel):
    success: bool
    summary: str


class JavaClient(Protocol):
    async def execute_tool(self, request: JavaToolCall) -> JavaToolResult: ...


class UnavailableJavaClient:
    async def execute_tool(self, request: JavaToolCall) -> JavaToolResult:
        raise RuntimeError(f"Java tool execution is not configured for tool: {request.tool}")
