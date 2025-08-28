import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { WorkbenchType, getDefaultWorkbench } from '../types/workbench';
import { ToolId, isValidToolId } from '../types/toolId';
import { useFlatToolRegistry } from '../data/useTranslatedToolRegistry';

/**
 * NavigationContext - Complete navigation management system
 *
 * Handles navigation modes, navigation guards for unsaved changes,
 * and breadcrumb/history navigation. Separated from FileContext to
 * maintain clear separation of concerns.
 */

// Navigation state
interface NavigationContextState {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
}

// Navigation actions
type NavigationAction =
  | { type: 'SET_WORKBENCH'; payload: { workbench: WorkbenchType } }
  | { type: 'SET_SELECTED_TOOL'; payload: { toolId: ToolId | null } }
  | { type: 'SET_TOOL_AND_WORKBENCH'; payload: { toolId: ToolId | null; workbench: WorkbenchType } }
  | { type: 'SET_UNSAVED_CHANGES'; payload: { hasChanges: boolean } }
  | { type: 'SET_PENDING_NAVIGATION'; payload: { navigationFn: (() => void) | null } }
  | { type: 'SHOW_NAVIGATION_WARNING'; payload: { show: boolean } };

// Navigation reducer
const navigationReducer = (state: NavigationContextState, action: NavigationAction): NavigationContextState => {
  switch (action.type) {
    case 'SET_WORKBENCH':
      return { ...state, workbench: action.payload.workbench };

    case 'SET_SELECTED_TOOL':
      return { ...state, selectedTool: action.payload.toolId };

    case 'SET_TOOL_AND_WORKBENCH':
      return {
        ...state,
        selectedTool: action.payload.toolId,
        workbench: action.payload.workbench
      };

    case 'SET_UNSAVED_CHANGES':
      return { ...state, hasUnsavedChanges: action.payload.hasChanges };

    case 'SET_PENDING_NAVIGATION':
      return { ...state, pendingNavigation: action.payload.navigationFn };

    case 'SHOW_NAVIGATION_WARNING':
      return { ...state, showNavigationWarning: action.payload.show };

    default:
      return state;
  }
};

// Initial state
const initialState: NavigationContextState = {
  workbench: getDefaultWorkbench(),
  selectedTool: null,
  hasUnsavedChanges: false,
  pendingNavigation: null,
  showNavigationWarning: false
};

// Navigation context actions interface
export interface NavigationContextActions {
  setWorkbench: (workbench: WorkbenchType) => void;
  setSelectedTool: (toolId: ToolId | null) => void;
  setToolAndWorkbench: (toolId: ToolId | null, workbench: WorkbenchType) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  showNavigationWarning: (show: boolean) => void;
  requestNavigation: (navigationFn: () => void) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  clearToolSelection: () => void;
  handleToolSelect: (toolId: string) => void;
}

// Context state values
export interface NavigationContextStateValue {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
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
  const toolRegistry = useFlatToolRegistry();

  const actions: NavigationContextActions = {
    setWorkbench: useCallback((workbench: WorkbenchType) => {
      dispatch({ type: 'SET_WORKBENCH', payload: { workbench } });
    }, []),

    setSelectedTool: useCallback((toolId: ToolId | null) => {
      dispatch({ type: 'SET_SELECTED_TOOL', payload: { toolId } });
    }, []),

    setToolAndWorkbench: useCallback((toolId: ToolId | null, workbench: WorkbenchType) => {
      dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId, workbench } });
    }, []),

    setHasUnsavedChanges: useCallback((hasChanges: boolean) => {
      dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges } });
    }, []),

    showNavigationWarning: useCallback((show: boolean) => {
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show } });
    }, []),

    requestNavigation: useCallback((navigationFn: () => void) => {
      if (!state.hasUnsavedChanges) {
        navigationFn();
        return;
      }

      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
    }, [state.hasUnsavedChanges]),

    confirmNavigation: useCallback(() => {
      if (state.pendingNavigation) {
        state.pendingNavigation();
      }

      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
    }, [state.pendingNavigation]),

    cancelNavigation: useCallback(() => {
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
    }, []),

    clearToolSelection: useCallback(() => {
      dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId: null, workbench: getDefaultWorkbench() } });
    }, []),

    handleToolSelect: useCallback((toolId: string) => {
      if (toolId === 'allTools') {
        dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId: null, workbench: getDefaultWorkbench() } });
        return;
      }

      if (toolId === 'read' || toolId === 'view-pdf') {
        dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId: null, workbench: 'viewer' } });
        return;
      }

      // Look up the tool in the registry to get its proper workbench

      const tool = isValidToolId(toolId)? toolRegistry[toolId] : null;
      const workbench = tool ? (tool.workbench || getDefaultWorkbench()) : getDefaultWorkbench();

      // Validate toolId and convert to ToolId type
      const validToolId = isValidToolId(toolId) ? toolId : null;
      dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId: validToolId, workbench } });
    }, [toolRegistry])
  };

  const stateValue: NavigationContextStateValue = {
    workbench: state.workbench,
    selectedTool: state.selectedTool,
    hasUnsavedChanges: state.hasUnsavedChanges,
    pendingNavigation: state.pendingNavigation,
    showNavigationWarning: state.showNavigationWarning
  };

  const actionsValue: NavigationContextActionsValue = {
    actions
  };

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
