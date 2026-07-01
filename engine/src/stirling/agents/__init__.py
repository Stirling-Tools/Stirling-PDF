"""Agent modules for Stirling AI reasoning flows."""

from collections.abc import Iterable

from ._registry import AgentDescriptor, RegisterableAgent
from .execution import ExecutionPlanningAgent
from .orchestrator import OrchestratorAgent
from .pdf_create import PdfCreateAgent
from .pdf_edit import PdfEditAgent, PdfEditParameterSelector, PdfEditPlanSelection
from .pdf_questions import PdfQuestionAgent
from .pdf_review import PdfReviewAgent
from .user_spec import UserSpecAgent


def build_descriptors(agents: Iterable[RegisterableAgent]) -> list[AgentDescriptor]:
    """The canonical descriptor list driving both orchestrator routing and the MCP
    manifest. Pass the live agent singletons. Adding an agent means implementing
    ``describe`` and including its instance in the caller's list.
    """
    return [agent.describe() for agent in agents]


__all__ = [
    "AgentDescriptor",
    "ExecutionPlanningAgent",
    "OrchestratorAgent",
    "PdfCreateAgent",
    "PdfEditAgent",
    "PdfEditParameterSelector",
    "PdfEditPlanSelection",
    "PdfQuestionAgent",
    "PdfReviewAgent",
    "RegisterableAgent",
    "UserSpecAgent",
    "build_descriptors",
]
