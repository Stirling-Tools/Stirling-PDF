from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from stirling.services.tracking import current_user_id

_USER_ID_HEADER = "X-User-Id"


class UserIdMiddleware(BaseHTTPMiddleware):
    """Extract X-User-Id header and set it as the current user for PostHog tracking."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        user_id = request.headers.get(_USER_ID_HEADER)
        if user_id:
            token = current_user_id.set(user_id)
            try:
                return await call_next(request)
            finally:
                current_user_id.reset(token)
        return await call_next(request)
