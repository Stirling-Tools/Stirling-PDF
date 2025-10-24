/**
 * Types for automation functionality
 */

import type { ToolId, RegularToolId } from './toolId';
import { TOOL_IDS, isLinkToolId, isSuperToolId } from './toolId';
import type { ToolRegistryEntry } from '../data/toolsTaxonomy';

const NON_AUTOMATABLE_TOOL_IDS = [
  'multiTool',
  'sign',
  'getPdfInfo',
  'read',
  'showJS',
  'devApi',
  'devFolderScanning',
  'devSsoGuide',
  'devAirgapped',
  'compare',
] as const satisfies readonly ToolId[];

type NonAutomatableToolId = typeof NON_AUTOMATABLE_TOOL_IDS[number];

export type AutomateToolId = Exclude<RegularToolId, NonAutomatableToolId>;
export type AutomateToolRegistry = Record<AutomateToolId, ToolRegistryEntry>;

const nonAutomatableSet = new Set<NonAutomatableToolId>(NON_AUTOMATABLE_TOOL_IDS);

export const isAutomateToolId = (toolId: ToolId): toolId is AutomateToolId =>
  !isSuperToolId(toolId) && !isLinkToolId(toolId) && !nonAutomatableSet.has(toolId as NonAutomatableToolId);

export const AUTOMATABLE_TOOL_IDS = TOOL_IDS.filter(isAutomateToolId) as AutomateToolId[];

export interface AutomationOperation {
  operation: AutomateToolId;
  parameters: Record<string, any>;
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
  operation: AutomateToolId | '';
  name: string;
  configured: boolean;
  parameters?: Record<string, any>;
}

export type AutomationStep = typeof import('../constants/automation').AUTOMATION_STEPS[keyof typeof import('../constants/automation').AUTOMATION_STEPS];

export interface AutomationStepData {
  step: AutomationStep;
  mode?: AutomationMode;
  automation?: AutomationConfig;
}

export interface ExecutionStep {
  id: string;
  operation: AutomateToolId;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
}

export interface AutomationExecutionCallbacks {
  onStepStart?: (stepIndex: number, operationName: AutomateToolId) => void;
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
  description?: string;
  operations: AutomationOperation[];
  createdAt: string;
  updatedAt: string;
  icon: any; // MUI Icon component
}
