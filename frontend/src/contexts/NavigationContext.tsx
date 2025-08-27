import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { useNavigationUrlSync } from '../hooks/useUrlSync';
import { ModeType, isValidMode, getDefaultMode } from '../types/navigation';

/**
 * NavigationContext - Complete navigation management system
 *
 * Handles navigation modes, navigation guards for unsaved changes,
 * and breadcrumb/history navigation. Separated from FileContext to
 * maintain clear separation of concerns.
 */

// Navigation state
interface NavigationState {
  currentMode: ModeType;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
  selectedToolKey: string | null; // Add tool selection to navigation state
}

// Navigation actions
type NavigationAction =
  | { type: 'SET_MODE'; payload: { mode: ModeType } }
  | { type: 'SET_UNSAVED_CHANGES'; payload: { hasChanges: boolean } }
  | { type: 'SET_PENDING_NAVIGATION'; payload: { navigationFn: (() => void) | null } }
  | { type: 'SHOW_NAVIGATION_WARNING'; payload: { show: boolean } }
  | { type: 'SET_SELECTED_TOOL'; payload: { toolKey: string | null } };

// Navigation reducer
const navigationReducer = (state: NavigationState, action: NavigationAction): NavigationState => {
  switch (action.type) {
    case 'SET_MODE':
      return { ...state, currentMode: action.payload.mode };

    case 'SET_UNSAVED_CHANGES':
      return { ...state, hasUnsavedChanges: action.payload.hasChanges };

    case 'SET_PENDING_NAVIGATION':
      return { ...state, pendingNavigation: action.payload.navigationFn };

    case 'SHOW_NAVIGATION_WARNING':
      return { ...state, showNavigationWarning: action.payload.show };

    case 'SET_SELECTED_TOOL':
      return { ...state, selectedToolKey: action.payload.toolKey };

    default:
      return state;
  }
};

// Initial state
const initialState: NavigationState = {
  currentMode: getDefaultMode(),
  hasUnsavedChanges: false,
  pendingNavigation: null,
  showNavigationWarning: false,
  selectedToolKey: null
};

// Navigation context actions interface
export interface NavigationContextActions {
  setMode: (mode: ModeType) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  showNavigationWarning: (show: boolean) => void;
  requestNavigation: (navigationFn: () => void) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  selectTool: (toolKey: string) => void;
  clearToolSelection: () => void;
  handleToolSelect: (toolId: string) => void;
}

// Split context values
export interface NavigationContextStateValue {
  currentMode: ModeType;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
  selectedToolKey: string | null;
}

export interface NavigationContextActionsValue {
  actions: NavigationContextActions;
}

// Create contexts
const NavigationStateContext = createContext<NavigationContextStateValue | undefined>(undefined);
const NavigationActionsContext = createContext<NavigationContextActionsValue | undefined>(undefined);

// Provider component
export const NavigationProvider: React.FC<{
  children: React.ReactNode;
  enableUrlSync?: boolean;
}> = ({ children, enableUrlSync = true }) => {
  const [state, dispatch] = useReducer(navigationReducer, initialState);

  const actions: NavigationContextActions = {
    setMode: useCallback((mode: ModeType) => {
      dispatch({ type: 'SET_MODE', payload: { mode } });
    }, []),

    setHasUnsavedChanges: useCallback((hasChanges: boolean) => {
      dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges } });
    }, []),

    showNavigationWarning: useCallback((show: boolean) => {
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show } });
    }, []),

    requestNavigation: useCallback((navigationFn: () => void) => {
      // If no unsaved changes, navigate immediately
      if (!state.hasUnsavedChanges) {
        navigationFn();
        return;
      }

      // Otherwise, store the navigation and show warning
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
    }, [state.hasUnsavedChanges]),

    confirmNavigation: useCallback(() => {
      // Execute pending navigation
      if (state.pendingNavigation) {
        state.pendingNavigation();
      }

      // Clear navigation state
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
    }, [state.pendingNavigation]),

    cancelNavigation: useCallback(() => {
      // Clear navigation without executing
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
    }, []),

    selectTool: useCallback((toolKey: string) => {
      dispatch({ type: 'SET_SELECTED_TOOL', payload: { toolKey } });
    }, []),

    clearToolSelection: useCallback(() => {
      dispatch({ type: 'SET_SELECTED_TOOL', payload: { toolKey: null } });
      dispatch({ type: 'SET_MODE', payload: { mode: getDefaultMode() } });
    }, []),

    handleToolSelect: useCallback((toolId: string) => {
      // Handle special cases
      if (toolId === 'allTools') {
        dispatch({ type: 'SET_SELECTED_TOOL', payload: { toolKey: null } });
        dispatch({ type: 'SET_MODE', payload: { mode: getDefaultMode() } });
        return;
      }

      // Special-case: if tool is a dedicated reader tool, enter reader mode
      if (toolId === 'read' || toolId === 'view-pdf') {
        dispatch({ type: 'SET_SELECTED_TOOL', payload: { toolKey: null } });
        return;
      }

      dispatch({ type: 'SET_SELECTED_TOOL', payload: { toolKey: toolId } });
      dispatch({ type: 'SET_MODE', payload: { mode: 'fileEditor' as ModeType } });
    }, [])
  };

  const stateValue: NavigationContextStateValue = {
    currentMode: state.currentMode,
    hasUnsavedChanges: state.hasUnsavedChanges,
    pendingNavigation: state.pendingNavigation,
    showNavigationWarning: state.showNavigationWarning,
    selectedToolKey: state.selectedToolKey
  };

  const actionsValue: NavigationContextActionsValue = {
    actions
  };

  // Enable URL synchronization
  useNavigationUrlSync(state.currentMode, actions.setMode, enableUrlSync);

  return (
    <NavigationStateContext.Provider value={stateValue}>
      <NavigationActionsContext.Provider value={actionsValue}>
        {children}
      </NavigationActionsContext.Provider>
    </NavigationStateContext.Provider>
  );
};

// Navigation hooks
export const useNavigationState = () => {
  const context = useContext(NavigationStateContext);
  if (context === undefined) {
    throw new Error('useNavigationState must be used within NavigationProvider');
  }
  return context;
};

export const useNavigationActions = () => {
  const context = useContext(NavigationActionsContext);
  if (context === undefined) {
    throw new Error('useNavigationActions must be used within NavigationProvider');
  }
  return context;
};

// Combined hook for convenience
export const useNavigation = () => {
  const state = useNavigationState();
  const { actions } = useNavigationActions();
  return { ...state, ...actions };
};

// Navigation guard hook (equivalent to old useFileNavigation)
export const useNavigationGuard = () => {
  const state = useNavigationState();
  const { actions } = useNavigationActions();

  return {
    pendingNavigation: state.pendingNavigation,
    showNavigationWarning: state.showNavigationWarning,
    hasUnsavedChanges: state.hasUnsavedChanges,
    requestNavigation: actions.requestNavigation,
    confirmNavigation: actions.confirmNavigation,
    cancelNavigation: actions.cancelNavigation,
    setHasUnsavedChanges: actions.setHasUnsavedChanges,
    setShowNavigationWarning: actions.showNavigationWarning
  };
};

// Re-export utility functions from types for backward compatibility
export { isValidMode, getDefaultMode, type ModeType } from '../types/navigation';

// TODO: This will be expanded for URL-based routing system
// - URL parsing utilities
// - Route definitions
// - Navigation hooks with URL sync
// - History management
// - Breadcrumb restoration from URL params
