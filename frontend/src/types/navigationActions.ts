/**
 * Navigation action interfaces to break circular dependencies
 */

import { WorkbenchType, ToolId } from './navigation';

export interface NavigationActions {
  setWorkbench: (workbench: WorkbenchType) => void;
  setSelectedTool: (toolId: ToolId | null) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  showNavigationWarning: (show: boolean) => void;
  requestNavigation: (navigationFn: () => void) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
}

export interface NavigationState {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
}