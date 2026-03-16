from __future__ import annotations

import json
from collections.abc import Sequence
from typing import assert_never

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from models import ChatMessage


def _format_file_context(payload: dict) -> str:
    pages = payload.get("pages") or []
    lines = ["FILE CONTEXT:"]
    for item in pages:
        page = item.get("page")
        text = item.get("text")
        if page is None or not text:
            continue
        lines.append(f"Page {page}: {text}")
    return "\n".join(lines)


def _normalize_content(content: str | list[str | dict]) -> str:
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for item in content:
        if isinstance(item, str):
            parts.append(item)
        elif isinstance(item, dict):
            if item.get("type") == "file_context":
                parts.append(_format_file_context(item))
            else:
                parts.append(json.dumps(item, ensure_ascii=True))
    return "\n\n".join(part for part in parts if part)


def to_lc_messages(messages: Sequence[ChatMessage]):
    lc_messages: list[BaseMessage] = []
    for msg in messages:
        match msg.role:
            case "system":
                lc_messages.append(SystemMessage(content=_normalize_content(msg.content)))
            case "assistant":
                lc_messages.append(AIMessage(content=_normalize_content(msg.content)))
            case "user":
                lc_messages.append(HumanMessage(content=_normalize_content(msg.content)))
            case _:
                assert_never(msg.role)
    return lc_messages


__all__ = ["to_lc_messages"]
