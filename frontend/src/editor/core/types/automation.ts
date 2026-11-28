import type { IconName } from "@editor/ui/Icon";

/**
 * Types for automation functionality
 */

export interface AutomationOperation {
  operation: string;
  parameters: Record<string, unknown>;
}

export interface AutomationConfig {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  operations: AutomationOperation[];
  createdAt: string;
  updatedAt: string;
}

/** A step being edited in the builder; `operation` is "" until a tool is picked. */
export interface AutomationTool {
  id: string;
  operation: string;
  parameters?: Record<string, unknown>;
}

export type AutomationStep =
  (typeof import("@editor/constants/automation").AUTOMATION_STEPS)[keyof typeof import("@editor/constants/automation").AUTOMATION_STEPS];

export interface AutomationStepData {
  step: AutomationStep;
  mode?: AutomationMode;
  automation?: AutomationConfig;
  /** Where the automation came from; decides which actions the workspace offers. */
  source?: AutomationSource;
  /** Builder only: the step whose settings open first. */
  focusStepIndex?: number;
}

export type AutomationSource = "saved" | "suggested";

export interface ExecutionStep {
  id: string;
  operation: string;
  name: string;
  status: "pending" | "running" | "completed" | "error";
  error?: string;
}

export interface AutomationExecutionCallbacks {
  onStepStart?: (stepIndex: number, operationName: string) => void;
  onStepComplete?: (stepIndex: number, resultFiles: File[]) => void;
  onStepError?: (stepIndex: number, error: string) => void;
}

export interface AutomateParameters extends AutomationExecutionCallbacks {
  automationConfig?: AutomationConfig;
}

export enum AutomationMode {
  CREATE = "create",
  EDIT = "edit",
  SUGGESTED = "suggested",
}

export interface SuggestedAutomation {
  id: string;
  name: string;
  description?: string;
  operations: AutomationOperation[];
  createdAt: string;
  updatedAt: string;
  icon: IconName;
}
