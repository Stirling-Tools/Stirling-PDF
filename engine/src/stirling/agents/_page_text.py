from __future__ import annotations

from stirling.contracts import ExtractedFileText, ExtractedTextArtifact, OrchestratorRequest


def get_extracted_text_artifact(request: OrchestratorRequest) -> ExtractedTextArtifact | None:
    for artifact in request.artifacts:
        if isinstance(artifact, ExtractedTextArtifact):
            return artifact
    return None


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
