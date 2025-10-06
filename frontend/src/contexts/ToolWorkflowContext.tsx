/**
 * ToolWorkflowContext - Manages tool selection, UI state, and workflow coordination
 * Eliminates prop drilling with a single, simple context
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { useToolManagement } from '../hooks/useToolManagement';
import { PageEditorFunctions } from '../types/pageEditor';
import { ToolRegistryEntry, ToolRegistry } from '../data/toolsTaxonomy';
import { useNavigationActions, useNavigationState } from './NavigationContext';
import { ToolId, isValidToolId } from '../types/toolId';
import { useNavigationUrlSync } from '../hooks/useUrlSync';
import { getDefaultWorkbench } from '../types/workbench';
import { filterToolRegistryByQuery } from '../utils/toolSearch';
import { useToolHistory } from '../hooks/tools/useToolHistory';
import { LegacyToolStyleSettings, defaultLegacyToolSettings } from '../components/tools/LegacyToolSettings';

// State interface
type ToolPanelMode = 'sidebar' | 'legacy';

interface ToolWorkflowState {
  // UI State
  sidebarsVisible: boolean;
  leftPanelView: 'toolPicker' | 'toolContent' | 'hidden';
  readerMode: boolean;
  toolPanelMode: ToolPanelMode;
  legacyToolSettings: LegacyToolStyleSettings;

  // File/Preview State
  previewFile: File | null;
  pageEditorFunctions: PageEditorFunctions | null;

  // Search State
  searchQuery: string;
}

// Actions
type ToolWorkflowAction =
  | { type: 'SET_SIDEBARS_VISIBLE'; payload: boolean }
  | { type: 'SET_LEFT_PANEL_VIEW'; payload: 'toolPicker' | 'toolContent' | 'hidden' }
  | { type: 'SET_READER_MODE'; payload: boolean }
  | { type: 'SET_TOOL_PANEL_MODE'; payload: ToolPanelMode }
  | { type: 'SET_LEGACY_TOOL_SETTINGS'; payload: LegacyToolStyleSettings }
  | { type: 'SET_PREVIEW_FILE'; payload: File | null }
  | { type: 'SET_PAGE_EDITOR_FUNCTIONS'; payload: PageEditorFunctions | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'RESET_UI_STATE' };

// Initial state
export const TOOL_PANEL_MODE_STORAGE_KEY = 'toolPanelModePreference';
export const LEGACY_TOOL_SETTINGS_STORAGE_KEY = 'legacyToolStyleSettings';

const getStoredToolPanelMode = (): ToolPanelMode => {
  if (typeof window === 'undefined') {
    return 'sidebar';
  }

  const stored = window.localStorage.getItem(TOOL_PANEL_MODE_STORAGE_KEY);
  if (stored === 'legacy' || stored === 'fullscreen') {
    return 'legacy';
  }

  return 'sidebar';
};

const getStoredLegacyToolSettings = (): LegacyToolStyleSettings => {
  if (typeof window === 'undefined') {
    return defaultLegacyToolSettings;
  }

  try {
    const stored = window.localStorage.getItem(LEGACY_TOOL_SETTINGS_STORAGE_KEY);
    if (stored) {
      return { ...defaultLegacyToolSettings, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to parse legacy tool settings:', e);
  }

  return defaultLegacyToolSettings;
};

const baseState: Omit<ToolWorkflowState, 'toolPanelMode' | 'legacyToolSettings'> = {
  sidebarsVisible: true,
  leftPanelView: 'toolPicker',
  readerMode: false,
  previewFile: null,
  pageEditorFunctions: null,
  searchQuery: '',
};

const createInitialState = (): ToolWorkflowState => ({
  ...baseState,
  toolPanelMode: getStoredToolPanelMode(),
  legacyToolSettings: getStoredLegacyToolSettings(),
});

// Reducer
function toolWorkflowReducer(state: ToolWorkflowState, action: ToolWorkflowAction): ToolWorkflowState {
  switch (action.type) {
    case 'SET_SIDEBARS_VISIBLE':
      return { ...state, sidebarsVisible: action.payload };
    case 'SET_LEFT_PANEL_VIEW':
      return { ...state, leftPanelView: action.payload };
    case 'SET_READER_MODE':
      return { ...state, readerMode: action.payload };
    case 'SET_TOOL_PANEL_MODE':
      return { ...state, toolPanelMode: action.payload };
    case 'SET_LEGACY_TOOL_SETTINGS':
      return { ...state, legacyToolSettings: action.payload };
    case 'SET_PREVIEW_FILE':
      return { ...state, previewFile: action.payload };
    case 'SET_PAGE_EDITOR_FUNCTIONS':
      return { ...state, pageEditorFunctions: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'RESET_UI_STATE':
      return {
        ...baseState,
        toolPanelMode: state.toolPanelMode,
        legacyToolSettings: state.legacyToolSettings,
        searchQuery: state.searchQuery,
      };
    default:
      return state;
  }
}

// Context value interface
interface ToolWorkflowContextValue extends ToolWorkflowState {
  // Tool management (from hook)
  selectedToolKey: string | null;
  selectedTool: ToolRegistryEntry | null;
  toolRegistry: Record<string, ToolRegistryEntry>;
  getSelectedTool: (toolId: string | null) => ToolRegistryEntry | null;

  // UI Actions
  setSidebarsVisible: (visible: boolean) => void;
  setLeftPanelView: (view: 'toolPicker' | 'toolContent' | 'hidden') => void;
  setReaderMode: (mode: boolean) => void;
  setToolPanelMode: (mode: ToolPanelMode) => void;
  setLegacyToolSettings: (settings: LegacyToolStyleSettings) => void;
  setPreviewFile: (file: File | null) => void;
  setPageEditorFunctions: (functions: PageEditorFunctions | null) => void;
  setSearchQuery: (query: string) => void;

  // Tool Actions
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
  filteredTools: Array<{ item: [string, ToolRegistryEntry]; matchedText?: string }>; // Filtered by search
  isPanelVisible: boolean;

  // Tool History
  recentTools: ToolId[];
  favoriteTools: ToolId[];
  addToRecent: (toolId: ToolId) => void;
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
    recentTools,
    favoriteTools,
    addToRecent,
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

  const setLegacyToolSettings = useCallback((settings: LegacyToolStyleSettings) => {
    dispatch({ type: 'SET_LEGACY_TOOL_SETTINGS', payload: settings });
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

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(TOOL_PANEL_MODE_STORAGE_KEY, state.toolPanelMode);
  }, [state.toolPanelMode]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(LEGACY_TOOL_SETTINGS_STORAGE_KEY, JSON.stringify(state.legacyToolSettings));
  }, [state.legacyToolSettings]);

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
    // Track tool usage in recent history
    addToRecent(toolId);

    // Handle read tool selection - should behave exactly like QuickAccessBar read button
    if (toolId === 'read') {
      setReaderMode(true);
      actions.setSelectedTool('read');
      actions.setWorkbench('viewer');
      setSearchQuery('');
      setToolPanelMode('sidebar'); // Close legacy mode when switching to reader
      setLeftPanelView('toolPicker'); // Show tool picker when navigating back to tools
      return;
    }

    // Handle multiTool selection - enable page editor workbench
    if (toolId === 'multiTool') {
      setReaderMode(false);
      setLeftPanelView('toolPicker'); // Show tool picker when navigating back to tools in mobile
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
  }, [actions, getSelectedTool, setLeftPanelView, setReaderMode, setSearchQuery, addToRecent]);

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

  // URL sync for proper tool navigation
  useNavigationUrlSync(
    navigationState.selectedTool,
    handleToolSelect,
    handleBackToTools,
    toolRegistry as ToolRegistry,
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
    setLegacyToolSettings,
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
    recentTools,
    favoriteTools,
    addToRecent,
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
    setLegacyToolSettings,
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
    recentTools,
    favoriteTools,
    addToRecent,
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
