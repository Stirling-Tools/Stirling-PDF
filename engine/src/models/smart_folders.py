from __future__ import annotations

from pydantic import Field

from .base import ApiModel
from .chat import ChatMessage


class AvailableTool(ApiModel):
    id: str
    name: str


class SmartFolderOperation(ApiModel):
    operation: str
    parameters: str = Field(default="{}")


class SmartFolderAutomation(ApiModel):
    name: str
    description: str | None = None
    operations: list[SmartFolderOperation] = Field(default_factory=list)


class SmartFolderConfig(ApiModel):
    name: str
    description: str
    automation: SmartFolderAutomation
    icon: str
    accent_color: str


class SmartFolderCreateRequest(ApiModel):
    message: str = ""
    history: list[ChatMessage] = Field(default_factory=list)
    available_tools: list[AvailableTool] = Field(default_factory=list)


class SmartFolderCreateResponse(ApiModel):
    assistant_message: str
    smart_folder_config: SmartFolderConfig | None = None
