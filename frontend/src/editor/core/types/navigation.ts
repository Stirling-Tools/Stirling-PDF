/**
 * Navigation types for workbench and tool separation
 */

import { WorkbenchType } from "@editor/types/workbench";
import { ToolId } from "@editor/types/toolId";

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
