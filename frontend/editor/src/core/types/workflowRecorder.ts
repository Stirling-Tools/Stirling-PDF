import type { AutomationConfig } from "@app/types/automation";
import type { ToolId } from "@app/types/toolId";

export type RecorderStepStatus = "recorded" | "incomplete" | "skipped";

export type RecorderSkipReason =
  | "toolNotInRegistry"
  | "toolDoesNotSupportAutomate"
  | "missingOperationConfig"
  | "sensitiveParameters"
  | "nonSerializableParameters"
  | "nestedAutomation";

export interface WorkflowRecorderEvent {
  operationType: ToolId;
  parameters: unknown;
  inputCount: number;
  outputCount: number;
  endpoint?: string;
}

export interface RecordedOperationStep {
  id: string;
  operation: ToolId;
  toolName: string;
  parameters: Record<string, unknown>;
  status: RecorderStepStatus;
  skipReason?: RecorderSkipReason;
  capturedAt: string;
  inputCount: number;
  outputCount: number;
  endpoint?: string;
}

export interface WorkflowRecorderDraft {
  id: string;
  name: string;
  description: string;
  icon: string;
  startedAt: string;
  updatedAt: string;
  steps: RecordedOperationStep[];
}

export interface WorkflowRecorderState {
  isRecording: boolean;
  draft: WorkflowRecorderDraft | null;
}

export type WorkflowRecorderAutomationDraft = AutomationConfig;
