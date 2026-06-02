from __future__ import annotations

from typing import NewType

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

# Stable, opaque identifier for a file supplied by the caller
FileId = NewType("FileId", str)

# Stable, opaque identifier for the calling user
UserId = NewType("UserId", str)

# Tenant that owns a document
OwnerId = NewType("OwnerId", str)

# An entity that can hold permissions on a document
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
