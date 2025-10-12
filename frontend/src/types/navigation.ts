/**
 * Navigation types for workbench and tool separation
 */

import { WorkbenchType } from './workbench';
import { ToolId } from './toolId';

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
