/**
 * Types for automation functionality
 */

export interface AutomationOperation {
  operation: string;
  parameters: Record<string, any>;
}

export interface AutomationConfig {
  id: string;
  name: string;
  description?: string;
  operations: AutomationOperation[];
  createdAt: string;
  updatedAt: string;
}

export interface AutomationTool {
  id: string;
  operation: string;
  name: string;
  configured: boolean;
  parameters?: Record<string, any>;
}

export interface AutomationStepData {
  step: 'selection' | 'creation' | 'run';
  mode?: AutomationMode;
  automation?: AutomationConfig;
}

export interface ExecutionStep {
  id: string;
  operation: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
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
  CREATE = 'create',
  EDIT = 'edit',
  SUGGESTED = 'suggested'
}

export interface SuggestedAutomation {
  id: string;
  name: string;
  operations: string[];
  icon: any; // MUI Icon component
}

// Export the AutomateParameters interface that was previously defined inline
export interface AutomateParameters extends AutomationExecutionCallbacks {
  automationConfig?: AutomationConfig;
}