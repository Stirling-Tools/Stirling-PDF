"""Wire-contract test pinning the camelCase processor -> engine config push; keep in sync with the Java test."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from stirling.contracts import ConfigPushRequest

FIXTURE = Path(__file__).parent / "fixtures" / "processor_config_push.json"


def _load() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def test_processor_contract_round_trips_every_field() -> None:
    payload = _load()
    req = ConfigPushRequest.model_validate(payload)

    m = payload["models"]
    assert req.models.provider == m["provider"]
    assert req.models.smart_model == m["smartModel"]
    assert req.models.fast_model == m["fastModel"]
    assert req.models.smart_max_tokens == m["smartMaxTokens"]
    assert req.models.fast_max_tokens == m["fastMaxTokens"]
    assert req.models.api_key == m["apiKey"]
    assert req.models.base_url == m["baseUrl"]

    r = payload["rag"]
    assert req.rag.embedding_provider == r["embeddingProvider"]
    assert req.rag.embedding_model == r["embeddingModel"]
    assert req.rag.embedding_api_key == r["embeddingApiKey"]
    assert req.rag.embedding_base_url == r["embeddingBaseUrl"]
    assert req.rag.top_k == r["topK"]
    assert req.rag.max_searches == r["maxSearches"]

    limits = payload["limits"]
    assert req.limits.max_pages == limits["maxPages"]
    assert req.limits.max_characters == limits["maxCharacters"]
    assert req.limits.model_max_concurrency == limits["modelMaxConcurrency"]


def test_processor_contract_has_no_unmapped_keys() -> None:
    """Guard the fixture itself: every wire key must map to a model field, none silently absorbed by extra="ignore"."""
    payload = _load()
    expected = {
        "models": {
            "provider",
            "smartModel",
            "fastModel",
            "smartMaxTokens",
            "fastMaxTokens",
            "apiKey",
            "baseUrl",
        },
        "rag": {
            "embeddingProvider",
            "embeddingModel",
            "embeddingApiKey",
            "embeddingBaseUrl",
            "topK",
            "maxSearches",
        },
        "limits": {"maxPages", "maxCharacters", "modelMaxConcurrency"},
    }
    assert set(payload) == set(expected)
    for section, keys in expected.items():
        assert set(payload[section]) == keys
