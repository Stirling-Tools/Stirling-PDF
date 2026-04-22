"""Shared logging utilities for the Stirling AI engine."""

from __future__ import annotations

import json


class Pretty:
    """Lazy JSON formatter — only serialises when ``str()`` is called.

    Designed for use with ``logging``'s ``%s`` formatting so that the
    JSON serialisation is skipped entirely when the log message is
    never emitted.
    """

    __slots__ = ("_obj",)

    def __init__(self, obj: object) -> None:
        self._obj = obj

    def __str__(self) -> str:
        return json.dumps(self._obj, indent=2, default=str, ensure_ascii=True)
