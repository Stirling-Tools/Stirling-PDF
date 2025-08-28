/**
 * Navigation types for workbench and tool separation
 */

// Define workbench values once as source of truth
const WORKBENCH_TYPES = ['viewer', 'pageEditor', 'fileEditor'] as const;

// Workbench types - how the user interacts with content
export type WorkbenchType = typeof WORKBENCH_TYPES[number];

// Tool identity - what PDF operation we're performing (derived from registry)
export type ToolId = string;

// Navigation state
export interface NavigationState {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
}

export const getDefaultWorkbench = (): WorkbenchType => 'fileEditor';

// Type guard using the same source of truth - no duplication
export const isValidWorkbench = (value: string): value is WorkbenchType => {
  return WORKBENCH_TYPES.includes(value as WorkbenchType);
};

// Route parsing result
export interface ToolRoute {
  workbench: WorkbenchType;
  toolId: ToolId | null;
}
