from __future__ import annotations

import json
from typing import Any

from config import VERSIONS_DB_PATH
from models import VersionEntry


def _read_json(path: str) -> dict[str, Any]:
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _write_json(path: str, data: dict[str, Any]) -> None:
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)


def load_versions(user_id: str) -> list[VersionEntry]:
    data = _read_json(VERSIONS_DB_PATH)
    return [VersionEntry.model_validate(entry) for entry in data.get(user_id, [])]


def save_version(user_id: str, entry: VersionEntry) -> None:
    data = _read_json(VERSIONS_DB_PATH)
    versions = data.get(user_id, [])
    versions.insert(0, entry.model_dump(by_alias=True))
    data[user_id] = versions[:20]
    _write_json(VERSIONS_DB_PATH, data)


__all__ = [
    "load_versions",
    "save_version",
]
