from __future__ import annotations

import hmac

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from stirling.services.tracking import current_user_id

_USER_ID_HEADER = "X-User-Id"
_ENGINE_AUTH_HEADER = "X-Engine-Auth"
_HEALTH_PATHS = {"/health", "/healthz", "/readyz"}


class UserIdMiddleware(BaseHTTPMiddleware):
    """Set X-User-Id (stamped by the trusted Java proxy) as request context."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        user_id = request.headers.get(_USER_ID_HEADER)
        if user_id:
            token = current_user_id.set(user_id)
            try:
                return await call_next(request)
            finally:
                current_user_id.reset(token)
        return await call_next(request)


class EngineAuthMiddleware(BaseHTTPMiddleware):
    """Validate shared-secret header. Blank secret = dev mode (open); health probes exempt."""

    def __init__(self, app, expected_secret: str) -> None:
        super().__init__(app)
        self._expected_secret = expected_secret or ""
        # Precompute the bytes form once so per-request work is just the constant-time compare.
        self._expected_secret_bytes = self._expected_secret.encode("utf-8")

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path in _HEALTH_PATHS or not self._expected_secret:
            return await call_next(request)
        presented = request.headers.get(_ENGINE_AUTH_HEADER, "")
        if not hmac.compare_digest(presented.encode("utf-8"), self._expected_secret_bytes):
            return JSONResponse({"detail": "engine authentication failed"}, status_code=401)
        return await call_next(request)
