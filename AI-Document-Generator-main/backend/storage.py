from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from config import STYLE_DB_PATH, TEMPLATE_DB_PATH, VERSIONS_DB_PATH
from latex_utils import clean_generated_latex, extract_layout_hint


def _read_json(path: str) -> Dict[str, Any]:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return {}


def _write_json(path: str, data: Dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def load_user_style(user_id: str) -> Dict[str, Any]:
    """Load (or bootstrap) an individual user's preferred style."""
    data = _read_json(STYLE_DB_PATH)
    return data.get(
        user_id,
        {
            "layout_preference": "clean",
            "font_preference": "helvet",
            "tone": "professional",
            "color_accent": "blue",
            "last_doc_type": None,
        },
    )


def save_user_style(user_id: str, style_data: Dict[str, Any]) -> Dict[str, Any]:
    """Persist style preferences for a user."""
    all_data = _read_json(STYLE_DB_PATH)
    current = all_data.get(user_id, load_user_style(user_id))
    current.update(style_data)
    all_data[user_id] = current
    _write_json(STYLE_DB_PATH, all_data)
    return current


def load_user_templates(user_id: str) -> Dict[str, str]:
    templates = _read_json(TEMPLATE_DB_PATH)
    return templates.get(user_id, {})


def save_user_template(user_id: str, doc_type: str, latex_code: str) -> None:
    """Persist sanitized layout hints per doc type."""
    templates = _read_json(TEMPLATE_DB_PATH)
    user_templates = templates.get(user_id, {})
    sanitized = clean_generated_latex(latex_code)
    user_templates[doc_type] = extract_layout_hint(sanitized)
    templates[user_id] = user_templates
    _write_json(TEMPLATE_DB_PATH, templates)


def load_versions(user_id: str) -> List[Dict[str, Any]]:
    data = _read_json(VERSIONS_DB_PATH)
    return data.get(user_id, [])


def save_version(user_id: str, entry: Dict[str, Any]) -> None:
    data = _read_json(VERSIONS_DB_PATH)
    versions = data.get(user_id, [])
    versions.insert(0, entry)
    data[user_id] = versions[:20]
    _write_json(VERSIONS_DB_PATH, data)


__all__ = [
    "load_user_style",
    "save_user_style",
    "load_user_templates",
    "save_user_template",
    "load_versions",
    "save_version",
]
