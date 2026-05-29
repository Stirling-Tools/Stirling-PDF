from __future__ import annotations

from typing import NewType

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# Stable, opaque identifier for a file supplied by the caller. Owned by the caller's
# ID strategy (content hash, filesystem path, etc.) and used as the RAG collection key
# throughout the engine.
FileId = NewType("FileId", str)

# Stable, opaque identifier for the calling user, supplied by the Java backend via the
# X-User-Id header (and stamped into a ContextVar by UserIdMiddleware). Every per-user
# storage operation in the document store is keyed by this so two users with the same
# FileId remain isolated.
UserId = NewType("UserId", str)


class ApiModel(BaseModel):
    """Base for every contract model crossing a service boundary."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )
