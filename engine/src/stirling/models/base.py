from __future__ import annotations

from typing import NewType

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# Stable, opaque identifier for a file supplied by the caller. Owned by the caller's
# ID strategy (content hash, filesystem path, etc.) and used as the RAG collection key
# throughout the engine.
FileId = NewType("FileId", str)

# Stable, opaque identifier for the calling user, supplied by the Java backend via the
# X-User-Id header (and stamped into a ContextVar by UserIdMiddleware). Used as both
# the default OwnerId and PrincipalId for personal documents.
UserId = NewType("UserId", str)

# Tenant that owns a document. May be a user (``user:bob``) or an org (``org:acme``);
# the engine treats it as an opaque string. Determines the physical row in
# ``documents_meta`` and is the only principal who can delete the doc.
OwnerId = NewType("OwnerId", str)

# An entity that can hold permissions on a document — a user, a group, a role, an
# org. Stored in ``document_acl`` rows; matched against the caller's principal set
# on every read. The engine doesn't interpret the string; Java decides what set of
# principals a caller has (membership in groups, etc.) and which set to grant on
# ingest.
PrincipalId = NewType("PrincipalId", str)


class ApiModel(BaseModel):
    """Base for every contract model crossing a service boundary."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        extra="forbid",
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
    )
