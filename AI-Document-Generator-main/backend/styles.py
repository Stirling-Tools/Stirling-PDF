from __future__ import annotations

from typing import Any, Dict

from storage import load_user_style, save_user_style


def update_style_profile_from_prompt(user_id: str, prompt: str) -> Dict[str, Any]:
    """Simple heuristics to remember color/font/tone preferences from prompt text."""
    style = load_user_style(user_id)
    lower = (prompt or "").lower()

    if "modern" in lower or "minimal" in lower:
        style["layout_preference"] = "modern"
        style["tone"] = "minimalist"
    if "classic" in lower or "formal" in lower:
        style["layout_preference"] = "classic"
        style["tone"] = "formal"
    if "serif" in lower:
        style["font_preference"] = "serif"
    if "sans" in lower:
        style["font_preference"] = "helvet"
    if "blue" in lower:
        style["color_accent"] = "blue"
    if "red" in lower:
        style["color_accent"] = "red"
    if "green" in lower:
        style["color_accent"] = "green"

    return save_user_style(user_id, style)


__all__ = ["update_style_profile_from_prompt"]
