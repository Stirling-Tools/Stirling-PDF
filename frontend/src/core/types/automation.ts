/**
 * Types for automation functionality
 */

import type { ConditionalKeys } from 'type-fest';
import type { ToolId } from '@app/types/toolId';
import { TOOL_IDS, isLinkToolId, isSuperToolId } from '@app/types/toolId';
import type { ToolRegistryEntry } from '@app/data/toolsTaxonomy';
import { AUTOMATION_STEPS } from '@app/constants/automation';

const IS_AUTOMATABLE = {
  certSign: true,
  sign: false,
  addPassword: true,
  removePassword: true,
  removePages: true,
  removeBlanks: true,
  removeAnnotations: true,
  removeImage: true,
  changePermissions: true,
  watermark: true,
  sanitize: true,
  split: true,
  merge: true,
  convert: true,
  ocr: true,
  addImage: true,
  rotate: true,
  scannerImageSplit: true,
  editTableOfContents: true,
  scannerEffect: true,
  autoRename: true,
  pageLayout: true,
  scalePages: true,
  adjustContrast: true,
  crop: true,
  pdfToSinglePage: true,
  repair: true,
  compare: false,
  addPageNumbers: true,
  redact: true,
  flatten: true,
  removeCertSign: true,
  unlockPDFForms: true,
  compress: true,
  extractPages: true,
  reorganizePages: true,
  extractImages: true,
  addStamp: true,
  addAttachments: true,
  changeMetadata: true,
  overlayPdfs: true,
  getPdfInfo: false,
  validateSignature: true,
  replaceColor: true,
  showJS: false,
  bookletImposition: true,
  multiTool: false,
  read: false,
  automate: false,
  devApi: false,
  devFolderScanning: false,
  devSsoGuide: false,
  devAirgapped: false,
} as const satisfies Record<ToolId, boolean>;

export type AutomateToolId = ConditionalKeys<typeof IS_AUTOMATABLE, true>;

export type AutomateToolRegistry = Record<AutomateToolId, ToolRegistryEntry>;

export const isAutomateToolId = (toolId: ToolId): toolId is AutomateToolId =>
  !isSuperToolId(toolId) && !isLinkToolId(toolId) && IS_AUTOMATABLE[toolId];

export const AUTOMATABLE_TOOL_IDS: AutomateToolId[] = TOOL_IDS.filter(isAutomateToolId);

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

export type AutomationStep = typeof AUTOMATION_STEPS[keyof typeof AUTOMATION_STEPS];

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
