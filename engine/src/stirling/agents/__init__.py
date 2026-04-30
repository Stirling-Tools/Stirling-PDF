"""Agent modules for Stirling AI reasoning flows."""

from collections.abc import Iterable

from ._registry import DelegatableAgent, DelegateRegistrar
from .execution import ExecutionPlanningAgent
from .orchestrator import OrchestratorAgent
from .pdf_edit import PdfEditAgent, PdfEditParameterSelector, PdfEditPlanSelection
from .pdf_questions import PdfQuestionAgent
from .user_spec import UserSpecAgent


def build_delegates(registrars: Iterable[DelegateRegistrar]) -> list[DelegatableAgent]:
    """Turn a collection of agent instances into their orchestrator delegates.
    Extending is a one-line append at the caller.
    """
    return [r.register_delegate() for r in registrars]


__all__ = [
    "DelegateRegistrar",
    "ExecutionPlanningAgent",
    "OrchestratorAgent",
    "PdfEditAgent",
    "PdfEditParameterSelector",
    "PdfEditPlanSelection",
    "PdfQuestionAgent",
    "UserSpecAgent",
    "build_delegates",
]
