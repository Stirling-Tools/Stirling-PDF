/**
 * ToolWorkflowContext - Manages tool selection, UI state, and workflow coordination
 * Eliminates prop drilling with a single, simple context
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { useToolManagement } from '@app/hooks/useToolManagement';
import { PageEditorFunctions } from '@app/types/pageEditor';
import { ToolRegistryEntry, ToolRegistry } from '@app/data/toolsTaxonomy';
import { useNavigationActions, useNavigationState } from '@app/contexts/NavigationContext';
import { ToolId, isValidToolId } from '@app/types/toolId';
import { WorkbenchType, getDefaultWorkbench, isBaseWorkbench } from '@app/types/workbench';
import { useNavigationUrlSync } from '@app/hooks/useUrlSync';
import { filterToolRegistryByQuery } from '@app/utils/toolSearch';
import { useToolHistory } from '@app/hooks/tools/useUserToolActivity';
import {
  ToolWorkflowState,
  createInitialState,
  toolWorkflowReducer,
} from '@app/contexts/toolWorkflow/toolWorkflowState';
import type { ToolPanelMode } from '@app/constants/toolPanel';
import { usePreferences } from '@app/contexts/PreferencesContext';
import { useToolRegistry } from '@app/contexts/ToolRegistryContext';
import { useAppConfig } from '@app/contexts/AppConfigContext';

// State interface
// Types and reducer/state moved to './toolWorkflow/state'

// Context value interface
export interface CustomWorkbenchViewRegistration {
  id: string;
  workbenchId: WorkbenchType;
  label: string;
  icon?: React.ReactNode;
  component: React.ComponentType<{ data: any }>;
}

export interface CustomWorkbenchViewInstance extends CustomWorkbenchViewRegistration {
  data: any;
}

interface ToolWorkflowContextValue extends ToolWorkflowState {
  // Tool management (from hook)
  selectedToolKey: ToolId | null;
  selectedTool: ToolRegistryEntry | null;
  toolRegistry: Partial<ToolRegistry>;
  getSelectedTool: (toolId: ToolId | null) => ToolRegistryEntry | null;

  // UI Actions
  setSidebarsVisible: (visible: boolean) => void;
  setLeftPanelView: (view: 'toolPicker' | 'toolContent' | 'hidden') => void;
  setReaderMode: (mode: boolean) => void;
  setToolPanelMode: (mode: ToolPanelMode) => void;
  setPreviewFile: (file: File | null) => void;
  setPageEditorFunctions: (functions: PageEditorFunctions | null) => void;
  setSearchQuery: (query: string) => void;


  selectTool: (toolId: ToolId | null) => void;
  clearToolSelection: () => void;

  // Tool Reset Actions
  toolResetFunctions: Record<string, () => void>;
  registerToolReset: (toolId: string, resetFunction: () => void) => void;
  resetTool: (toolId: string) => void;

  // Workflow Actions (compound actions)
  handleToolSelect: (toolId: ToolId) => void;
  handleBackToTools: () => void;
  handleReaderToggle: () => void;

  // Computed values
  filteredTools: Array<{ item: [ToolId, ToolRegistryEntry]; matchedText?: string }>; // Filtered by search
  isPanelVisible: boolean;

  // Tool History
  favoriteTools: ToolId[];
  toggleFavorite: (toolId: ToolId) => void;
  isFavorite: (toolId: ToolId) => boolean;

  customWorkbenchViews: CustomWorkbenchViewInstance[];
  registerCustomWorkbenchView: (view: CustomWorkbenchViewRegistration) => void;
  unregisterCustomWorkbenchView: (id: string) => void;
  setCustomWorkbenchViewData: (id: string, data: any) => void;
  clearCustomWorkbenchViewData: (id: string) => void;
}

// Ensure a single context instance across HMR to avoid provider/consumer mismatches
const __GLOBAL_CONTEXT_KEY__ = '__ToolWorkflowContext__';
const existingContext = (globalThis as any)[__GLOBAL_CONTEXT_KEY__] as React.Context<ToolWorkflowContextValue | undefined> | undefined;
const ToolWorkflowContext = existingContext ?? createContext<ToolWorkflowContextValue | undefined>(undefined);
if (!existingContext) {
  (globalThis as any)[__GLOBAL_CONTEXT_KEY__] = ToolWorkflowContext;
}

// Provider component
interface ToolWorkflowProviderProps {
  children: React.ReactNode;
}

export function ToolWorkflowProvider({ children }: ToolWorkflowProviderProps) {
  const [state, dispatch] = useReducer(toolWorkflowReducer, undefined, createInitialState);
  const { preferences, updatePreference } = usePreferences();

  // Store reset functions for tools
  const [toolResetFunctions, setToolResetFunctions] = React.useState<Record<string, () => void>>({});

  const [customViewRegistry, setCustomViewRegistry] = React.useState<Record<string, CustomWorkbenchViewRegistration>>({});
  const [customViewData, setCustomViewData] = React.useState<Record<string, any>>({});

  // Navigation actions and state are available since we're inside NavigationProvider
  const { actions } = useNavigationActions();
  const navigationState = useNavigationState();

  // Tool management hook
  const { toolRegistry, getSelectedTool } = useToolManagement();
  const { allTools } = useToolRegistry();
  const { config } = useAppConfig();
  const premiumEnabled = config?.premiumEnabled;

  // Tool history hook
  const {
    favoriteTools,
    toggleFavorite,
    isFavorite,
  } = useToolHistory();

  // Get selected tool from navigation context
  const selectedTool = getSelectedTool(navigationState.selectedTool);

  // UI Action creators
  const setSidebarsVisible = useCallback((visible: boolean) => {
    dispatch({ type: 'SET_SIDEBARS_VISIBLE', payload: visible });
  }, []);

  const setLeftPanelView = useCallback((view: 'toolPicker' | 'toolContent' | 'hidden') => {
    dispatch({ type: 'SET_LEFT_PANEL_VIEW', payload: view });
  }, []);

  const setReaderMode = useCallback((mode: boolean) => {
    if (mode) {
      actions.setWorkbench('viewer');
      actions.setSelectedTool('read');
    }
    dispatch({ type: 'SET_READER_MODE', payload: mode });
  }, [actions]);

  const setToolPanelMode = useCallback((mode: ToolPanelMode) => {
    dispatch({ type: 'SET_TOOL_PANEL_MODE', payload: mode });
    updatePreference('defaultToolPanelMode', mode);
  }, [updatePreference]);


  const setPreviewFile = useCallback((file: File | null) => {
    dispatch({ type: 'SET_PREVIEW_FILE', payload: file });
    if (file) {
      actions.setWorkbench('viewer');
    }
  }, [actions]);

  const setPageEditorFunctions = useCallback((functions: PageEditorFunctions | null) => {
    dispatch({ type: 'SET_PAGE_EDITOR_FUNCTIONS', payload: functions });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  }, []);

  const registerCustomWorkbenchView = useCallback((view: CustomWorkbenchViewRegistration) => {
    setCustomViewRegistry(prev => ({ ...prev, [view.id]: view }));
  }, []);

  const unregisterCustomWorkbenchView = useCallback((id: string) => {
    let removedView: CustomWorkbenchViewRegistration | undefined;

    setCustomViewRegistry(prev => {
      const existing = prev[id];
      if (!existing) {
        return prev;
      }
      removedView = existing;
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });

    setCustomViewData(prev => {
      if (!(id in prev)) {
        return prev;
      }
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });

    if (removedView && navigationState.workbench === removedView.workbenchId) {
      actions.setWorkbench(getDefaultWorkbench());
    }
  }, [actions, navigationState.workbench]);

  const setCustomWorkbenchViewData = useCallback((id: string, data: any) => {
    setCustomViewData(prev => ({ ...prev, [id]: data }));
  }, []);

  const clearCustomWorkbenchViewData = useCallback((id: string) => {
    setCustomViewData(prev => {
      if (!(id in prev)) {
        return prev;
      }
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });
  }, []);

  const customWorkbenchViews = useMemo<CustomWorkbenchViewInstance[]>(() => {
    return Object.values(customViewRegistry).map(view => ({
      ...view,
      data: Object.prototype.hasOwnProperty.call(customViewData, view.id) ? customViewData[view.id] : null,
    }));
  }, [customViewRegistry, customViewData]);

  useEffect(() => {
    const { workbench } = navigationState;
    if (isBaseWorkbench(workbench)) {
      return;
    }

    const currentCustomView = customWorkbenchViews.find(view => view.workbenchId === workbench);
    const expectedWorkbench = selectedTool?.workbench;
    const workbenchOwnedBySelectedTool = expectedWorkbench === workbench;

    if (!currentCustomView || currentCustomView.data == null) {
      // If the currently selected tool expects this custom workbench, allow it
      // some time to register/populate the view instead of immediately bouncing
      // the user back to Active Files.
      if (workbenchOwnedBySelectedTool) {
        return;
      }
      actions.setWorkbench(getDefaultWorkbench());
    }
  }, [actions, customWorkbenchViews, navigationState.workbench, selectedTool]);

  // Persisted via PreferencesContext; no direct localStorage writes needed here

  // Keep tool panel mode in sync with user preference. This ensures the
  // Config setting (Default tool picker mode) immediately affects the app
  // and persists across reloads.
  useEffect(() => {
    const preferredMode = preferences.defaultToolPanelMode;
    if (preferredMode !== state.toolPanelMode) {
      dispatch({ type: 'SET_TOOL_PANEL_MODE', payload: preferredMode });
    }
  }, [preferences.defaultToolPanelMode, state.toolPanelMode]);

  // Tool reset methods
  const registerToolReset = useCallback((toolId: string, resetFunction: () => void) => {
    setToolResetFunctions(prev => ({ ...prev, [toolId]: resetFunction }));
  }, []);

  const resetTool = useCallback((toolId: string) => {
    // Use the current state directly instead of depending on the state in the closure
    setToolResetFunctions(current => {
      const resetFunction = current[toolId];
      if (resetFunction) {
        resetFunction();
      }
      return current; // Return the same state to avoid unnecessary updates
    });
  }, []); // Empty dependency array makes this stable

  // Workflow actions (compound actions that coordinate multiple state changes)
  const handleToolSelect = useCallback((toolId: ToolId) => {
    // Check if tool requires premium and premium is not enabled
    const selectedTool = allTools[toolId];
    if (selectedTool?.requiresPremium === true && premiumEnabled !== true) {
      // Premium tool selected without premium - do nothing (should be disabled in UI)
      return;
    }

    // If we're currently on a custom workbench (e.g., Validate Signature report),
    // selecting any tool should take the user back to the default file manager view.
    const wasInCustomWorkbench = !isBaseWorkbench(navigationState.workbench);

    // Handle read tool selection - should behave exactly like QuickAccessBar read button
    if (toolId === 'read') {
      setReaderMode(true);
      actions.setSelectedTool('read');
      actions.setWorkbench(wasInCustomWorkbench ? getDefaultWorkbench() : 'viewer');
      setSearchQuery('');
      return;
    }

    // Handle multiTool selection - enable page editor workbench
    if (toolId === 'multiTool') {
      setReaderMode(false);
      setLeftPanelView('hidden');
      actions.setSelectedTool('multiTool');
      actions.setWorkbench(wasInCustomWorkbench ? getDefaultWorkbench() : 'pageEditor');
      setSearchQuery('');
      return;
    }

    // Set the selected tool and determine the appropriate workbench
    const validToolId = isValidToolId(toolId) ? toolId : null;
    actions.setSelectedTool(validToolId);

    // Get the tool from registry to determine workbench
    const tool = getSelectedTool(toolId);
    if (wasInCustomWorkbench) {
      actions.setWorkbench(getDefaultWorkbench());
    } else if (tool && tool.workbench) {
      actions.setWorkbench(tool.workbench);
    } else {
      actions.setWorkbench(getDefaultWorkbench());
    }

    // Clear search query when selecting a tool
    setSearchQuery('');
    setLeftPanelView('toolContent');
    setReaderMode(false); // Disable read mode when selecting tools
  }, [actions, getSelectedTool, navigationState.workbench, setLeftPanelView, setReaderMode, setSearchQuery, allTools, premiumEnabled]);

  const handleBackToTools = useCallback(() => {
    setLeftPanelView('toolPicker');
    setReaderMode(false);
    actions.setSelectedTool(null);
  }, [setLeftPanelView, setReaderMode, actions.setSelectedTool]);

  const handleReaderToggle = useCallback(() => {
    setReaderMode(true);
  }, [setReaderMode]);

  // Filter tools based on search query with fuzzy matching (name, description, id, synonyms)
  const filteredTools = useMemo(() => {
    if (!toolRegistry) return [];
    return filterToolRegistryByQuery(toolRegistry, state.searchQuery);
  }, [toolRegistry, state.searchQuery]);

  const isPanelVisible = useMemo(() =>
    state.sidebarsVisible && !state.readerMode && state.leftPanelView !== 'hidden',
    [state.sidebarsVisible, state.readerMode, state.leftPanelView]
  );

  useNavigationUrlSync(
    navigationState.selectedTool,
    handleToolSelect,
    handleBackToTools,
    allTools,
    true
  );

  // Properly memoized context value
  const contextValue = useMemo((): ToolWorkflowContextValue => ({
    // State
    ...state,
    selectedToolKey: navigationState.selectedTool,
    selectedTool,
    toolRegistry,
    getSelectedTool,

    // Actions
    setSidebarsVisible,
    setLeftPanelView,
    setReaderMode,
    setToolPanelMode,
    setPreviewFile,
    setPageEditorFunctions,
    setSearchQuery,
    selectTool: actions.setSelectedTool,
    clearToolSelection: () => actions.setSelectedTool(null),

    // Tool Reset Actions
    toolResetFunctions,
    registerToolReset,
    resetTool,

    // Workflow Actions
    handleToolSelect,
    handleBackToTools,
    handleReaderToggle,

    // Computed
    filteredTools,
    isPanelVisible,

    // Tool History
    favoriteTools,
    toggleFavorite,
    isFavorite,

    // Custom workbench views
    customWorkbenchViews,
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  }), [
    state,
    navigationState.selectedTool,
    selectedTool,
    toolRegistry,
    getSelectedTool,
    setSidebarsVisible,
    setLeftPanelView,
    setReaderMode,
    setToolPanelMode,
    setPreviewFile,
    setPageEditorFunctions,
    setSearchQuery,
    actions.setSelectedTool,
    registerToolReset,
    resetTool,
    handleToolSelect,
    handleBackToTools,
    handleReaderToggle,
    filteredTools,
    isPanelVisible,
    favoriteTools,
    toggleFavorite,
    isFavorite,
    customWorkbenchViews,
    registerCustomWorkbenchView,
    unregisterCustomWorkbenchView,
    setCustomWorkbenchViewData,
    clearCustomWorkbenchViewData,
  ]);

  return (
    <ToolWorkflowContext.Provider value={contextValue}>
      {children}
    </ToolWorkflowContext.Provider>
  );
}

// Custom hook to use the context
export function useToolWorkflow(): ToolWorkflowContextValue {
  const context = useContext(ToolWorkflowContext);
  if (!context) {
    console.error('ToolWorkflowContext not found. Current stack:', new Error().stack);
    throw new Error('useToolWorkflow must be used within a ToolWorkflowProvider');
  }
  return context;
}
