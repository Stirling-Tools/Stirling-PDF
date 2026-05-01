"""Structured sticky-note comment specs for the ``add-comments`` tool.

The ``/api/v1/misc/add-comments`` tool takes a JSON string of comment specs
(see :class:`stirling.models.tool_models.AddCommentsParams`). This module
defines the typed Python shape we serialise into that string so callers
don't have to hand-roll dictionaries.
"""

from __future__ import annotations

from pydantic import Field

from stirling.models import ApiModel


class CommentSpec(ApiModel):
    """Sticky-note spec serialised into the ``comments`` JSON string sent to
    ``/api/v1/misc/add-comments``. The backend's tool contract takes the JSON
    string form, not this type; this is the engine-side structured representation.
    """

    page_index: int = Field(description="0-indexed page number.")
    x: float = Field(description="Bottom-left x coord of the icon (PDF user-space).")
    y: float = Field(description="Bottom-left y coord of the icon (PDF user-space).")
    width: float = Field(description="Width of the icon in user-space units.")
    height: float = Field(description="Height of the icon in user-space units.")
    text: str = Field(description="Comment body shown in the popup.")
    author: str | None = Field(default=None)
    subject: str | None = Field(default=None)
    anchor_text: str | None = Field(
        default=None,
        description=(
            "Optional text snippet to locate on the page; when set, the server anchors"
            " the icon at the first matching line and ignores the x/y coords."
        ),
    )
