/**
 * Navigation types for workbench and tool separation
 */

import { WorkbenchType } from '@app/types/workbench';
import { ToolId } from '@app/types/toolId';

// Navigation state
export interface NavigationState {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
}


// Route parsing result
export interface ToolRoute {
  workbench: WorkbenchType;
  toolId: ToolId | null;
}
