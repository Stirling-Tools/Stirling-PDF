/**
 * Navigation action interfaces to break circular dependencies
 */

import { ModeType } from './navigation';

export interface NavigationActions {
  setMode: (mode: ModeType) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  showNavigationWarning: (show: boolean) => void;
  requestNavigation: (navigationFn: () => void) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
}

export interface NavigationState {
  currentMode: ModeType;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
}