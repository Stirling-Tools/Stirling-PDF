/**
 * ToolWorkflowContext - Manages tool selection, UI state, and workflow coordination
 * Eliminates prop drilling with a single, simple context
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { useToolManagement } from '../hooks/useToolManagement';
import { PageEditorFunctions } from '../types/pageEditor';
import { ToolRegistryEntry, ToolRegistry } from '../data/toolsTaxonomy';
import { useNavigationActions, useNavigationState } from './NavigationContext';
import { ToolId, isValidToolId } from '../types/toolId';
import { getDefaultWorkbench } from '../types/workbench';
import { filterToolRegistryByQuery } from '../utils/toolSearch';
import { useToolHistory } from '../hooks/tools/useUserToolActivity';
import {
  ToolWorkflowState,
  TOOL_PANEL_MODE_STORAGE_KEY,
  createInitialState,
  toolWorkflowReducer,
  ToolPanelMode,
} from './toolWorkflow/toolWorkflowState';
import { usePreferences } from './PreferencesContext';

// State interface
// Types and reducer/state moved to './toolWorkflow/state'

// Context value interface
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
}

const ToolWorkflowContext = createContext<ToolWorkflowContextValue | undefined>(undefined);

// Provider component
interface ToolWorkflowProviderProps {
  children: React.ReactNode;
}

export function ToolWorkflowProvider({ children }: ToolWorkflowProviderProps) {
  const [state, dispatch] = useReducer(toolWorkflowReducer, undefined, createInitialState);
  const { preferences } = usePreferences();

  // Store reset functions for tools
  const [toolResetFunctions, setToolResetFunctions] = React.useState<Record<string, () => void>>({});

  // Navigation actions and state are available since we're inside NavigationProvider
  const { actions } = useNavigationActions();
  const navigationState = useNavigationState();

  // Tool management hook
  const {
    toolRegistry,
    getSelectedTool,
  } = useToolManagement();

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
  }, []);


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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TOOL_PANEL_MODE_STORAGE_KEY, state.toolPanelMode);
  }, [state.toolPanelMode]);

  // Keep tool panel mode in sync with user preference. This ensures the
  // Config setting (Default tool picker mode) immediately affects the app
  // and persists across reloads.
  useEffect(() => {
    if (!preferences) return;
    const preferredMode = preferences.defaultToolPanelMode;
    if (preferredMode && preferredMode !== state.toolPanelMode) {
      dispatch({ type: 'SET_TOOL_PANEL_MODE', payload: preferredMode });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(TOOL_PANEL_MODE_STORAGE_KEY, preferredMode);
      }
    }
  }, [preferences.defaultToolPanelMode]);

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
    // Handle read tool selection - should behave exactly like QuickAccessBar read button
    if (toolId === 'read') {
      setReaderMode(true);
      actions.setSelectedTool('read');
      actions.setWorkbench('viewer');
      setSearchQuery('');
      return;
    }

    // Handle multiTool selection - enable page editor workbench
    if (toolId === 'multiTool') {
      setReaderMode(false);
      setLeftPanelView('hidden');
      actions.setSelectedTool('multiTool');
      actions.setWorkbench('pageEditor');
      setSearchQuery('');
      return;
    }

    // Set the selected tool and determine the appropriate workbench
    const validToolId = isValidToolId(toolId) ? toolId : null;
    actions.setSelectedTool(validToolId);

    // Get the tool from registry to determine workbench
    const tool = getSelectedTool(toolId);
    if (tool && tool.workbench) {
      actions.setWorkbench(tool.workbench);
    } else {
      actions.setWorkbench(getDefaultWorkbench());
    }

    // Clear search query when selecting a tool
    setSearchQuery('');
    setLeftPanelView('toolContent');
    setReaderMode(false); // Disable read mode when selecting tools
  }, [actions, getSelectedTool, setLeftPanelView, setReaderMode, setSearchQuery]);

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
    return filterToolRegistryByQuery(toolRegistry as ToolRegistry, state.searchQuery);
  }, [toolRegistry, state.searchQuery]);

  const isPanelVisible = useMemo(() =>
    state.sidebarsVisible && !state.readerMode && state.leftPanelView !== 'hidden',
    [state.sidebarsVisible, state.readerMode, state.leftPanelView]
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
