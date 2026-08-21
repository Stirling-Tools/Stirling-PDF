"""Shared logging utilities for the Stirling AI engine."""

from __future__ import annotations

import json

from pydantic import BaseModel


class Pretty:
    """Lazy JSON formatter — only serialises when ``str()`` is called.

    Designed for use with ``logging``'s ``%s`` formatting so that the
    JSON serialisation is skipped entirely when the log message is
    never emitted. Pydantic models (at the top level or nested) are
    dumped via ``model_dump``; anything else falls back to ``str``.
    """

    __slots__ = ("_obj",)

    def __init__(self, obj: object) -> None:
        self._obj = obj

    def __str__(self) -> str:
        if isinstance(self._obj, BaseModel):
            return self._obj.model_dump_json(indent=2)
        return json.dumps(self._obj, indent=2, default=_default, ensure_ascii=True)


def _default(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump()
    return str(value)
