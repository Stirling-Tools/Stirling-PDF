"""Which capabilities each app surface may route to.

Java owns the enforcing gate (`AiWorkflowService.advance`). This narrows what the router is
even offered, so the processor stops proposing document work that would be refused a layer
later — cheaper, and it lets the model say something true instead of promising a tool call
that never happens.
"""

from __future__ import annotations

from stirling.contracts import AssistantSurface, SupportedCapability

# Every capability the router may delegate to. Nothing outside this set is reachable from any
# surface, so a new surface can only ever subtract.
_EDITOR_CAPABILITIES: frozenset[SupportedCapability] = frozenset(
    {
        SupportedCapability.PDF_EDIT,
        SupportedCapability.PDF_QUESTION,
        SupportedCapability.PDF_REVIEW,
        SupportedCapability.PDF_CREATE,
        SupportedCapability.AGENT_DRAFT,
    }
)

# The processor has no file workspace, so it keeps only the file-independent capability:
# drafting an agent spec, which discards `request.files` anyway.
_BY_SURFACE: dict[AssistantSurface, frozenset[SupportedCapability]] = {
    AssistantSurface.EDITOR: _EDITOR_CAPABILITIES,
    AssistantSurface.PROCESSOR: frozenset({SupportedCapability.AGENT_DRAFT}),
}


def capabilities_for(surface: AssistantSurface) -> frozenset[SupportedCapability]:
    """Capabilities routable from `surface`.

    Intersecting with the editor set is what makes widening structurally impossible: however
    `_BY_SURFACE` is edited later, no surface can return a capability the editor does not have.
    """
    return _EDITOR_CAPABILITIES & _BY_SURFACE.get(surface, _EDITOR_CAPABILITIES)


def allows(surface: AssistantSurface, capability: SupportedCapability) -> bool:
    return capability in capabilities_for(surface)


def document_work_decline(surface: AssistantSurface) -> str:
    """Why the request was declined, and where the user can go instead.

    Authored here rather than left to the model: a model told it has no document tools will
    sometimes claim it did the work anyway.
    """
    if surface is AssistantSurface.PROCESSOR:
        return (
            "I can't work on documents here — the processor has no file workspace. Open the"
            " editor to do this to a file, or ask me to make it a rule so it happens to every"
            " file that arrives."
        )
    return "That isn't something I can do on this screen."
