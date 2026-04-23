from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel

MAX_INDEX_TEXT_LENGTH = 1_000_000  # 1MB text limit per index request


class RagStatusResponse(ApiModel):
    embedding_model: str
    collections: list[str]


class RagIndexRequest(ApiModel):
    collection: str = Field(min_length=1)
    text: str = Field(max_length=MAX_INDEX_TEXT_LENGTH)
    source: str = ""
    metadata: dict[str, str] = Field(default_factory=dict)


class RagIndexResponse(ApiModel):
    collection: str
    chunks_indexed: int


class RagSearchRequest(ApiModel):
    query: str
    collection: str | None = Field(default=None, min_length=1)
    top_k: int = 5


class RagSearchResultItem(ApiModel):
    text: str
    source: str
    chunk_id: str
    score: float


class RagSearchResponse(ApiModel):
    query: str
    results: list[RagSearchResultItem]


class RagCollectionsResponse(ApiModel):
    collections: list[str]


class RagDeleteCollectionResponse(ApiModel):
    status: str
    collection: str
