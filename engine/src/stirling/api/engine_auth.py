"""
Shared-secret middleware that locks the engine to the trusted Java backend.

Config: STIRLING_ENGINE_SHARED_SECRET (non-public routes need X-Engine-Auth or 401) and
STIRLING_ENGINE_REQUIRE_AUTH (fail closed with 503 when truthy and no secret is set).
"""

from __future__ import annotations

import hmac
import logging
import os
from collections.abc import Iterable

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

logger = logging.getLogger(__name__)

_ENV_VAR = "STIRLING_ENGINE_SHARED_SECRET"
_REQUIRE_ENV = "STIRLING_ENGINE_REQUIRE_AUTH"
_HEADER = "X-Engine-Auth"

# Public paths (liveness + docs); everything else needs the secret when configured.
_PUBLIC_PREFIXES: tuple[str, ...] = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
)

_TRUTHY = {"1", "true", "yes", "on"}


def _is_truthy(value: str | None) -> bool:
    return value is not None and value.strip().lower() in _TRUTHY


class EngineSharedSecretMiddleware(BaseHTTPMiddleware):
    """Reject non-public requests lacking the shared secret.

    Non-public path: secret set -> require matching X-Engine-Auth (else 401); else require flag
    truthy -> 503 (fail-closed); else allow through.
    """

    def __init__(self, app: ASGIApp, public_prefixes: Iterable[str] = _PUBLIC_PREFIXES) -> None:
        super().__init__(app)
        self._public_prefixes = tuple(public_prefixes)
        self._secret = os.getenv(_ENV_VAR)
        self._require = _is_truthy(os.getenv(_REQUIRE_ENV))
        if self._secret:
            logger.info(
                "Engine shared-secret enforcement ENABLED: non-public routes require a valid %s"
                " header (constant-time compared).",
                _HEADER,
            )
        elif self._require:
            logger.error(
                "%s is enabled but %s is not set - the engine will REFUSE every non-public request"
                " (HTTP 503, fail-closed) until a shared secret is configured.",
                _REQUIRE_ENV,
                _ENV_VAR,
            )
        else:
            logger.warning(
                "%s not set - engine shared-secret enforcement is DISABLED. The AI and document"
                " routes then trust the caller-supplied X-User-Id header alone. Set this secret"
                " (and %s=true) in any deployment that exposes the engine beyond localhost.",
                _ENV_VAR,
                _REQUIRE_ENV,
            )

    def _is_public(self, path: str) -> bool:
        return any(path == p or path.startswith(p + "/") for p in self._public_prefixes)

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if not self._is_public(request.url.path):
            if self._secret:
                offered = request.headers.get(_HEADER) or ""
                # Constant-time compare to avoid timing leaks.
                if not hmac.compare_digest(offered, self._secret):
                    return JSONResponse({"detail": "Missing or invalid X-Engine-Auth header."}, status_code=401)
            elif self._require:
                # Fail closed: require flag set but no secret configured.
                return JSONResponse(
                    {"detail": ("Engine authentication is required but no shared secret is configured.")},
                    status_code=503,
                )
        return await call_next(request)
