"""Custom exceptions for the editing module."""


class InsufficientCreditsError(Exception):
    """Raised when an operation is blocked due to insufficient credits."""

    def __init__(self, status_code: int = 429, error_body: str = "", error_json: dict | None = None):
        self.status_code = status_code
        self.error_body = error_body
        self.error_json = error_json or {}
        super().__init__(f"Insufficient credits (HTTP {status_code})")
