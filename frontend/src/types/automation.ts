/**
 * Types for automation functionality
 */

export interface AutomationOperation {
  operation: string;
  parameters: Record<string, JsonValue>;
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

export interface AutomationTool {
  id: string;
  operation: string;
  name: string;
  configured: boolean;
  parameters?: Record<string, JsonValue>;
}

export type AutomationStep = typeof import('../constants/automation').AUTOMATION_STEPS[keyof typeof import('../constants/automation').AUTOMATION_STEPS];

export interface AutomationStepData {
  step: AutomationStep;
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

export enum AutomationMode {
  CREATE = 'create',
  EDIT = 'edit',
  SUGGESTED = 'suggested'
}

export interface SuggestedAutomation {
  id: string;
  name: string;
  description?: string;
  operations: AutomationOperation[];
  createdAt: string;
  updatedAt: string;
  icon: any; // MUI Icon component
}

// Export the AutomateParameters interface that was previously defined inline
export interface AutomateParameters extends AutomationExecutionCallbacks {
  automationConfig?: AutomationConfig;
}

/**
 * Typen für Automations-Funktionalität
 */

// JSON-ähnlicher Wertetyp: erlaubt Strings, Zahlen, Booleans, null,
// Arrays und verschachtelte Objekte – genau das, was "parameters" benötigt.
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = Record<string, JsonValue>;

export interface AutomationOperation {
  operation: string;
  // Wurde von Record<string, string | number | boolean | null> auf JSON erweitert
  parameters: Record<string, JsonValue>;
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

export interface AutomationStepData {
  step: AutomationStep;
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
