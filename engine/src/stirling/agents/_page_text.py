from __future__ import annotations

from collections.abc import Iterable

from stirling.contracts import ExtractedFileText, ExtractedTextArtifact, WorkflowArtifact


def page_text_from_artifacts(artifacts: Iterable[WorkflowArtifact]) -> list[ExtractedFileText]:
    """Pull the page text from an :class:`ExtractedTextArtifact` in ``artifacts``, if present.
    Returns an empty list when no extracted text artifact has been attached."""
    for artifact in artifacts:
        if isinstance(artifact, ExtractedTextArtifact):
            return artifact.files
    return []


def has_page_text(page_text: list[ExtractedFileText]) -> bool:
    return any(selection.text.strip() for file_text in page_text for selection in file_text.pages)


def format_page_text(page_text: list[ExtractedFileText], empty: str = "None") -> str:
    if not has_page_text(page_text):
        return empty
    sections = [
        f"[File: {file_text.file_name}, Page {selection.page_number or '?'}]\n{selection.text}"
        for file_text in page_text
        for selection in file_text.pages
    ]
    return "\n\n".join(sections)
