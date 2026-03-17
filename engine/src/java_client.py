from __future__ import annotations

from flask import has_request_context, request

from config import JAVA_BACKEND_API_KEY, JAVA_BACKEND_URL


def java_url(path: str) -> str:
    base = JAVA_BACKEND_URL.rstrip("/")
    if not path.startswith("/"):
        path = "/" + path
    return f"{base}{path}"


def java_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if has_request_context():
        auth_header = request.headers.get("Authorization")
        if auth_header:
            headers["Authorization"] = auth_header
        api_key = request.headers.get("X-API-KEY")
        if api_key:
            headers["X-API-KEY"] = api_key
    if "X-API-KEY" not in headers and JAVA_BACKEND_API_KEY:
        headers["X-API-KEY"] = JAVA_BACKEND_API_KEY
    return headers
