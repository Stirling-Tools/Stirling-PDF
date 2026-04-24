from __future__ import annotations

from typing import NewType

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# Stable, opaque identifier for a file supplied by the caller. Owned by the caller's
# ID strategy (content hash, filesystem path, etc.) and used as the RAG collection key
# throughout the engine.
FileId = NewType("FileId", str)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
    )
