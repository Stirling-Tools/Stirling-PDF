import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { WorkbenchType, getDefaultWorkbench } from '@app/types/workbench';
import { ToolId, isValidToolId } from '@app/types/toolId';
import { useToolRegistry } from '@app/contexts/ToolRegistryContext';

/**
 * NavigationContext - Complete navigation management system
 *
 * Handles navigation modes, navigation guards for unsaved changes,
 * and breadcrumb/history navigation. Separated from FileContext to
 * maintain clear separation of concerns.
 */

// Viewer transition animation state
export interface ViewerTransitionState {
  isAnimating: boolean;
  sourceRect: DOMRect | null;
  sourceThumbnailUrl: string | null;
  transitionType: 'fileEditor' | 'pageEditor' | null;
  editorScreenshotUrl: string | null;
  editorScreenshotRect: DOMRect | null;
  isZooming: boolean;
  transitionDirection: 'enter' | 'exit' | null;
  exitTargetRect: DOMRect | null;
  exitFileId: string | null;
}

// Page editor spreading animation state
export interface PageEditorTransitionState {
  isAnimating: boolean;
  direction: 'enter' | 'exit';
  fileCardRects: Map<string, DOMRect>;
  filePageCounts: Map<string, number>;
  pageThumbnails: Map<string, string>; // Map file ID to first page thumbnail URL
  targetPageRects: Map<string, DOMRect> | null;
  editorScreenshotUrl: string | null;
  editorScreenshotRect: DOMRect | null;
}

// Navigation state
interface NavigationContextState {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
  viewerTransition: ViewerTransitionState;
  pageEditorTransition: PageEditorTransitionState | null;
}

// Navigation actions
type NavigationAction =
  | { type: 'SET_WORKBENCH'; payload: { workbench: WorkbenchType } }
  | { type: 'SET_SELECTED_TOOL'; payload: { toolId: ToolId | null } }
  | { type: 'SET_TOOL_AND_WORKBENCH'; payload: { toolId: ToolId | null; workbench: WorkbenchType } }
  | { type: 'SET_UNSAVED_CHANGES'; payload: { hasChanges: boolean } }
  | { type: 'SET_PENDING_NAVIGATION'; payload: { navigationFn: (() => void) | null } }
  | { type: 'SHOW_NAVIGATION_WARNING'; payload: { show: boolean } }
  | { type: 'START_VIEWER_TRANSITION'; payload: { sourceRect: DOMRect; sourceThumbnailUrl: string; transitionType: 'fileEditor' | 'pageEditor'; editorScreenshotUrl?: string; editorScreenshotRect?: DOMRect } }
  | { type: 'END_VIEWER_TRANSITION' }
  | { type: 'START_ZOOM' }
  | { type: 'START_EXIT_TRANSITION'; payload: { exitTargetRect: DOMRect; sourceThumbnailUrl: string; exitFileId: string } }
  | { type: 'START_PAGE_EDITOR_ENTRY'; payload: PageEditorTransitionState }
  | { type: 'START_PAGE_EDITOR_EXIT'; payload: Partial<PageEditorTransitionState> }
  | { type: 'UPDATE_PAGE_EDITOR_TARGETS'; payload: { targetPageRects: Map<string, DOMRect> } }
  | { type: 'END_PAGE_EDITOR_TRANSITION' };

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

    case 'START_VIEWER_TRANSITION':
      return {
        ...state,
        viewerTransition: {
          isAnimating: true,
          sourceRect: action.payload.sourceRect,
          sourceThumbnailUrl: action.payload.sourceThumbnailUrl,
          transitionType: action.payload.transitionType,
          editorScreenshotUrl: action.payload.editorScreenshotUrl || null,
          editorScreenshotRect: action.payload.editorScreenshotRect || null,
          isZooming: false,
          transitionDirection: 'enter',
          exitTargetRect: null,
          exitFileId: null
        }
      };

    case 'START_EXIT_TRANSITION':
      return {
        ...state,
        viewerTransition: {
          ...state.viewerTransition,
          isAnimating: true,
          transitionDirection: 'exit',
          exitTargetRect: action.payload.exitTargetRect,
          sourceThumbnailUrl: action.payload.sourceThumbnailUrl,
          exitFileId: action.payload.exitFileId,
          sourceRect: null, // Will be calculated after fileEditor renders
          isZooming: false
        }
      };

    case 'END_VIEWER_TRANSITION':
      return {
        ...state,
        viewerTransition: {
          isAnimating: false,
          sourceRect: null,
          sourceThumbnailUrl: null,
          transitionType: null,
          editorScreenshotUrl: null,
          editorScreenshotRect: null,
          isZooming: false,
          transitionDirection: null,
          exitTargetRect: null,
          exitFileId: null
        }
      };

    case 'START_ZOOM':
      return {
        ...state,
        viewerTransition: {
          ...state.viewerTransition,
          isZooming: true
        }
      };

    case 'START_PAGE_EDITOR_ENTRY':
      return {
        ...state,
        pageEditorTransition: action.payload
      };

    case 'START_PAGE_EDITOR_EXIT':
      return {
        ...state,
        pageEditorTransition: state.pageEditorTransition
          ? { ...state.pageEditorTransition, ...action.payload }
          : null
      };

    case 'UPDATE_PAGE_EDITOR_TARGETS':
      return {
        ...state,
        pageEditorTransition: state.pageEditorTransition
          ? { ...state.pageEditorTransition, targetPageRects: action.payload.targetPageRects }
          : null
      };

    case 'END_PAGE_EDITOR_TRANSITION':
      return {
        ...state,
        pageEditorTransition: null
      };

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
  showNavigationWarning: false,
    viewerTransition: {
      isAnimating: false,
      sourceRect: null,
      sourceThumbnailUrl: null,
      transitionType: null,
      editorScreenshotUrl: null,
      editorScreenshotRect: null,
      isZooming: false,
      transitionDirection: null,
      exitTargetRect: null,
      exitFileId: null
  },
  pageEditorTransition: null
};

// Navigation context actions interface
export interface NavigationContextActions {
  setWorkbench: (workbench: WorkbenchType) => void;
  setSelectedTool: (toolId: ToolId | null) => void;
  setToolAndWorkbench: (toolId: ToolId | null, workbench: WorkbenchType) => void;
  setHasUnsavedChanges: (hasChanges: boolean) => void;
  registerUnsavedChangesChecker: (checker: () => boolean) => void;
  unregisterUnsavedChangesChecker: () => void;
  showNavigationWarning: (show: boolean) => void;
  requestNavigation: (navigationFn: () => void) => void;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  clearToolSelection: () => void;
  handleToolSelect: (toolId: string) => void;
  startViewerTransition: (
    sourceRect: DOMRect,
    sourceThumbnailUrl: string,
    transitionType: 'fileEditor' | 'pageEditor',
    editorScreenshotUrl?: string,
    editorScreenshotRect?: DOMRect
  ) => void;
  endViewerTransition: () => void;
  startZoom: () => void;
  startExitTransition: (exitTargetRect: DOMRect, sourceThumbnailUrl: string, exitFileId: string) => void;
  startPageEditorEntryTransition: (state: PageEditorTransitionState) => void;
  startPageEditorExitTransition: (state: Partial<PageEditorTransitionState>) => void;
  updatePageEditorTargets: (targetPageRects: Map<string, DOMRect>) => void;
  endPageEditorTransition: () => void;
}

// Context state values
export interface NavigationContextStateValue {
  workbench: WorkbenchType;
  selectedTool: ToolId | null;
  hasUnsavedChanges: boolean;
  pendingNavigation: (() => void) | null;
  showNavigationWarning: boolean;
  viewerTransition: ViewerTransitionState;
  pageEditorTransition: PageEditorTransitionState | null;
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
}> = ({ children }) => {
  const [state, dispatch] = useReducer(navigationReducer, initialState);
  const { allTools: toolRegistry } = useToolRegistry();
  const unsavedChangesCheckerRef = React.useRef<(() => boolean) | null>(null);

  // Memoize individual callbacks
  const setWorkbench = useCallback((workbench: WorkbenchType) => {
      // Check for unsaved changes using registered checker or state
      const hasUnsavedChanges = unsavedChangesCheckerRef.current?.() || state.hasUnsavedChanges;
      console.log('[NavigationContext] setWorkbench:', {
        from: state.workbench,
        to: workbench,
        hasChecker: !!unsavedChangesCheckerRef.current,
        hasUnsavedChanges
      });

      // If we're leaving pageEditor, viewer, or custom workbench and have unsaved changes, request navigation
      const leavingWorkbenchWithChanges =
        (state.workbench === 'pageEditor' && workbench !== 'pageEditor' && hasUnsavedChanges) ||
        (state.workbench === 'viewer' && workbench !== 'viewer' && hasUnsavedChanges) ||
        (state.workbench.startsWith('custom:') && workbench !== state.workbench && hasUnsavedChanges);

      if (leavingWorkbenchWithChanges) {
        // Update state to reflect unsaved changes so modal knows
        if (!state.hasUnsavedChanges) {
          dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges: true } });
        }
        const performWorkbenchChange = () => {
          // When leaving a custom workbench, clear the selected tool
          console.log('[NavigationContext] performWorkbenchChange executing', {
            from: state.workbench,
            to: workbench,
            isCustom: state.workbench.startsWith('custom:')
          });
          if (state.workbench.startsWith('custom:')) {
            console.log('[NavigationContext] Clearing tool and changing workbench to:', workbench);
            dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId: null, workbench } });
          } else {
            console.log('[NavigationContext] Just changing workbench to:', workbench);
            dispatch({ type: 'SET_WORKBENCH', payload: { workbench } });
          }
        };
        dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: performWorkbenchChange } });
        dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
      } else {
        dispatch({ type: 'SET_WORKBENCH', payload: { workbench } });
      }
    }, [state.workbench, state.hasUnsavedChanges]);

    const setSelectedTool = useCallback((toolId: ToolId | null) => {
      dispatch({ type: 'SET_SELECTED_TOOL', payload: { toolId } });
    }, []);

    const setToolAndWorkbench = useCallback((toolId: ToolId | null, workbench: WorkbenchType) => {
      // Check for unsaved changes using registered checker or state
      const hasUnsavedChanges = unsavedChangesCheckerRef.current?.() || state.hasUnsavedChanges;

      // If we're leaving pageEditor, viewer, or custom workbench and have unsaved changes, request navigation
      const leavingWorkbenchWithChanges =
        (state.workbench === 'pageEditor' && workbench !== 'pageEditor' && hasUnsavedChanges) ||
        (state.workbench === 'viewer' && workbench !== 'viewer' && hasUnsavedChanges) ||
        (state.workbench.startsWith('custom:') && workbench !== state.workbench && hasUnsavedChanges);

      if (leavingWorkbenchWithChanges) {
        const performWorkbenchChange = () => {
          dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId, workbench } });
        };
        dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: performWorkbenchChange } });
        dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
      } else {
        dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId, workbench } });
      }
    }, [state.workbench, state.hasUnsavedChanges]);

    const setHasUnsavedChanges = useCallback((hasChanges: boolean) => {
      dispatch({ type: 'SET_UNSAVED_CHANGES', payload: { hasChanges } });
    }, []);

    const registerUnsavedChangesChecker = useCallback((checker: () => boolean) => {
      unsavedChangesCheckerRef.current = checker;
    }, []);

    const unregisterUnsavedChangesChecker = useCallback(() => {
      unsavedChangesCheckerRef.current = null;
    }, []);

    const showNavigationWarning = useCallback((show: boolean) => {
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show } });
    }, []);

    const requestNavigation = useCallback((navigationFn: () => void) => {
      if (!state.hasUnsavedChanges) {
        navigationFn();
        return;
      }

      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
    }, [state.hasUnsavedChanges]);

    const confirmNavigation = useCallback(() => {
      console.log('[NavigationContext] confirmNavigation called', {
        hasPendingNav: !!state.pendingNavigation,
        currentWorkbench: state.workbench,
        currentTool: state.selectedTool
      });
      if (state.pendingNavigation) {
        state.pendingNavigation();
      }

      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
      console.log('[NavigationContext] confirmNavigation completed');
    }, [state.pendingNavigation, state.workbench, state.selectedTool]);

    const cancelNavigation = useCallback(() => {
      dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: null } });
      dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: false } });
    }, []);

    const clearToolSelection = useCallback(() => {
      dispatch({ type: 'SET_TOOL_AND_WORKBENCH', payload: { toolId: null, workbench: getDefaultWorkbench() } });
    }, []);

    const handleToolSelect = useCallback((toolId: string) => {
      const performToolSelect = () => {
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
      };

      // Check for unsaved changes using registered checker or state
      const hasUnsavedChanges = unsavedChangesCheckerRef.current?.() || state.hasUnsavedChanges;

      // If switching away from current tool and have unsaved changes, show warning
      if (hasUnsavedChanges && state.selectedTool && state.selectedTool !== toolId) {
        dispatch({ type: 'SET_PENDING_NAVIGATION', payload: { navigationFn: performToolSelect } });
        dispatch({ type: 'SHOW_NAVIGATION_WARNING', payload: { show: true } });
      } else {
        performToolSelect();
      }
    }, [toolRegistry, state.hasUnsavedChanges, state.selectedTool]);

    const startViewerTransition = useCallback((
      sourceRect: DOMRect,
      sourceThumbnailUrl: string,
      transitionType: 'fileEditor' | 'pageEditor',
      editorScreenshotUrl?: string,
      editorScreenshotRect?: DOMRect
    ) => {
      dispatch({
        type: 'START_VIEWER_TRANSITION',
        payload: { sourceRect, sourceThumbnailUrl, transitionType, editorScreenshotUrl, editorScreenshotRect }
      });
    }, []);

    const endViewerTransition = useCallback(() => {
      dispatch({ type: 'END_VIEWER_TRANSITION' });
    }, []);

    const startZoom = useCallback(() => {
      dispatch({ type: 'START_ZOOM' });
    }, []);

    const startExitTransition = useCallback((exitTargetRect: DOMRect, sourceThumbnailUrl: string, exitFileId: string) => {
      dispatch({ type: 'START_EXIT_TRANSITION', payload: { exitTargetRect, sourceThumbnailUrl, exitFileId } });
    }, []);

    const startPageEditorEntryTransition = useCallback((transitionState: PageEditorTransitionState) => {
      dispatch({ type: 'START_PAGE_EDITOR_ENTRY', payload: transitionState });
    }, []);

    const startPageEditorExitTransition = useCallback((transitionState: Partial<PageEditorTransitionState>) => {
      dispatch({ type: 'START_PAGE_EDITOR_EXIT', payload: transitionState });
    }, []);

    const updatePageEditorTargets = useCallback((targetPageRects: Map<string, DOMRect>) => {
      dispatch({ type: 'UPDATE_PAGE_EDITOR_TARGETS', payload: { targetPageRects } });
    }, []);

    const endPageEditorTransition = useCallback(() => {
      dispatch({ type: 'END_PAGE_EDITOR_TRANSITION' });
    }, []);

  // Memoize the actions object to prevent unnecessary context updates
  // This is critical to avoid infinite loops when effects depend on actions
  const actions: NavigationContextActions = useMemo(() => ({
    setWorkbench,
    setSelectedTool,
    setToolAndWorkbench,
    setHasUnsavedChanges,
    registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker,
    showNavigationWarning,
    requestNavigation,
    confirmNavigation,
    cancelNavigation,
    clearToolSelection,
    handleToolSelect,
    startViewerTransition,
    endViewerTransition,
    startZoom,
    startExitTransition,
    startPageEditorEntryTransition,
    startPageEditorExitTransition,
    updatePageEditorTargets,
    endPageEditorTransition,
  }), [
    setWorkbench,
    setSelectedTool,
    setToolAndWorkbench,
    setHasUnsavedChanges,
    registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker,
    showNavigationWarning,
    requestNavigation,
    confirmNavigation,
    cancelNavigation,
    clearToolSelection,
    handleToolSelect,
    startViewerTransition,
    endViewerTransition,
    startZoom,
    startExitTransition,
    startPageEditorEntryTransition,
    startPageEditorExitTransition,
    updatePageEditorTargets,
    endPageEditorTransition,
  ]);

  const stateValue: NavigationContextStateValue = {
    workbench: state.workbench,
    selectedTool: state.selectedTool,
    hasUnsavedChanges: state.hasUnsavedChanges,
    pendingNavigation: state.pendingNavigation,
    showNavigationWarning: state.showNavigationWarning,
    viewerTransition: state.viewerTransition,
    pageEditorTransition: state.pageEditorTransition
  };

  // Also memoize the context value to prevent unnecessary re-renders
  const actionsValue: NavigationContextActionsValue = useMemo(() => ({
    actions
  }), [actions]);

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
    setShowNavigationWarning: actions.showNavigationWarning,
    registerUnsavedChangesChecker: actions.registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker: actions.unregisterUnsavedChangesChecker
  };
};
