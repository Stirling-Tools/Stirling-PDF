/**
 * ToolWorkflowContext - Manages tool selection, UI state, and workflow coordination
 * Eliminates prop drilling with a single, simple context
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { useToolManagement } from '../hooks/useToolManagement';
import { PageEditorFunctions } from '../types/pageEditor';
import { ToolRegistryEntry } from '../data/toolsTaxonomy';
import { useToolWorkflowUrlSync } from '../hooks/useUrlSync';
import { useNavigationActions, useNavigationState } from './NavigationContext';

// State interface
interface ToolWorkflowState {
  // UI State
  sidebarsVisible: boolean;
  leftPanelView: 'toolPicker' | 'toolContent';
  readerMode: boolean;

  // File/Preview State
  previewFile: File | null;
  pageEditorFunctions: PageEditorFunctions | null;

  // Search State
  searchQuery: string;
}

// Actions
type ToolWorkflowAction =
  | { type: 'SET_SIDEBARS_VISIBLE'; payload: boolean }
  | { type: 'SET_LEFT_PANEL_VIEW'; payload: 'toolPicker' | 'toolContent' }
  | { type: 'SET_READER_MODE'; payload: boolean }
  | { type: 'SET_PREVIEW_FILE'; payload: File | null }
  | { type: 'SET_PAGE_EDITOR_FUNCTIONS'; payload: PageEditorFunctions | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'RESET_UI_STATE' };

// Initial state
const initialState: ToolWorkflowState = {
  sidebarsVisible: true,
  leftPanelView: 'toolPicker',
  readerMode: false,
  previewFile: null,
  pageEditorFunctions: null,
  searchQuery: '',
};

// Reducer
function toolWorkflowReducer(state: ToolWorkflowState, action: ToolWorkflowAction): ToolWorkflowState {
  switch (action.type) {
    case 'SET_SIDEBARS_VISIBLE':
      return { ...state, sidebarsVisible: action.payload };
    case 'SET_LEFT_PANEL_VIEW':
      return { ...state, leftPanelView: action.payload };
    case 'SET_READER_MODE':
      return { ...state, readerMode: action.payload };
    case 'SET_PREVIEW_FILE':
      return { ...state, previewFile: action.payload };
    case 'SET_PAGE_EDITOR_FUNCTIONS':
      return { ...state, pageEditorFunctions: action.payload };
    case 'SET_SEARCH_QUERY':
      return { ...state, searchQuery: action.payload };
    case 'RESET_UI_STATE':
      return { ...initialState, searchQuery: state.searchQuery }; // Preserve search
    default:
      return state;
  }
}

// Context value interface
interface ToolWorkflowContextValue extends ToolWorkflowState {
  // Tool management (from hook)
  selectedToolKey: string | null;
  selectedTool: ToolRegistryEntry | null;
  toolRegistry: any; // From useToolManagement

  // UI Actions
  setSidebarsVisible: (visible: boolean) => void;
  setLeftPanelView: (view: 'toolPicker' | 'toolContent') => void;
  setReaderMode: (mode: boolean) => void;
  setPreviewFile: (file: File | null) => void;
  setPageEditorFunctions: (functions: PageEditorFunctions | null) => void;
  setSearchQuery: (query: string) => void;

  // Tool Actions
  selectTool: (toolId: string) => void;
  clearToolSelection: () => void;

  // Tool Reset Actions
  registerToolReset: (toolId: string, resetFunction: () => void) => void;
  resetTool: (toolId: string) => void;

  // Workflow Actions (compound actions)
  handleToolSelect: (toolId: string) => void;
  handleBackToTools: () => void;
  handleReaderToggle: () => void;

  // Computed values
  filteredTools: [string, ToolRegistryEntry][]; // Filtered by search
  isPanelVisible: boolean;
}

const ToolWorkflowContext = createContext<ToolWorkflowContextValue | undefined>(undefined);

// Provider component
interface ToolWorkflowProviderProps {
  children: React.ReactNode;
}

export function ToolWorkflowProvider({ children }: ToolWorkflowProviderProps) {
  const [state, dispatch] = useReducer(toolWorkflowReducer, initialState);

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

  // Get selected tool from navigation context
  const selectedTool = getSelectedTool(navigationState.selectedToolKey);

  // UI Action creators
  const setSidebarsVisible = useCallback((visible: boolean) => {
    dispatch({ type: 'SET_SIDEBARS_VISIBLE', payload: visible });
  }, []);

  const setLeftPanelView = useCallback((view: 'toolPicker' | 'toolContent') => {
    dispatch({ type: 'SET_LEFT_PANEL_VIEW', payload: view });
  }, []);

  const setReaderMode = useCallback((mode: boolean) => {
    dispatch({ type: 'SET_READER_MODE', payload: mode });
  }, []);

  const setPreviewFile = useCallback((file: File | null) => {
    dispatch({ type: 'SET_PREVIEW_FILE', payload: file });
    if (file) {
      actions.setMode('viewer');
    }
  }, [actions]);

  const setPageEditorFunctions = useCallback((functions: PageEditorFunctions | null) => {
    dispatch({ type: 'SET_PAGE_EDITOR_FUNCTIONS', payload: functions });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  }, []);

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
  const handleToolSelect = useCallback((toolId: string) => {
    actions.handleToolSelect(toolId);

    // Clear search query when selecting a tool
    setSearchQuery('');

    // Handle view switching logic
    if (toolId === 'allTools' || toolId === 'read' || toolId === 'view-pdf') {
      setLeftPanelView('toolPicker');
      if (toolId === 'read' || toolId === 'view-pdf') {
        setReaderMode(true);
      } else {
        setReaderMode(false);
      }
    } else {
      setLeftPanelView('toolContent');
      setReaderMode(false); // Disable read mode when selecting tools
    }
  }, [actions, setLeftPanelView, setReaderMode, setSearchQuery]);

  const handleBackToTools = useCallback(() => {
    setLeftPanelView('toolPicker');
    setReaderMode(false);
    actions.clearToolSelection();
  }, [setLeftPanelView, setReaderMode, actions]);

  const handleReaderToggle = useCallback(() => {
    setReaderMode(true);
  }, [setReaderMode]);

  // Filter tools based on search query
  const filteredTools = useMemo(() => {
    if (!toolRegistry) return [];
    return Object.entries(toolRegistry).filter(([_, { name }]) =>
      name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );
  }, [toolRegistry, state.searchQuery]);

  const isPanelVisible = useMemo(() =>
    state.sidebarsVisible && !state.readerMode,
    [state.sidebarsVisible, state.readerMode]
  );

  // Enable URL synchronization for tool selection
  useToolWorkflowUrlSync(navigationState.selectedToolKey, actions.selectTool, actions.clearToolSelection, true);

  // Properly memoized context value
  const contextValue = useMemo((): ToolWorkflowContextValue => ({
    // State
    ...state,
    selectedToolKey: navigationState.selectedToolKey,
    selectedTool,
    toolRegistry,

    // Actions
    setSidebarsVisible,
    setLeftPanelView,
    setReaderMode,
    setPreviewFile,
    setPageEditorFunctions,
    setSearchQuery,
    selectTool: actions.selectTool,
    clearToolSelection: actions.clearToolSelection,

    // Tool Reset Actions
    registerToolReset,
    resetTool,

    // Workflow Actions
    handleToolSelect,
    handleBackToTools,
    handleReaderToggle,

    // Computed
    filteredTools,
    isPanelVisible,
  }), [
    state,
    navigationState.selectedToolKey,
    selectedTool,
    toolRegistry,
    setSidebarsVisible,
    setLeftPanelView,
    setReaderMode,
    setPreviewFile,
    setPageEditorFunctions,
    setSearchQuery,
    actions.selectTool,
    actions.clearToolSelection,
    registerToolReset,
    resetTool,
    handleToolSelect,
    handleBackToTools,
    handleReaderToggle,
    filteredTools,
    isPanelVisible,
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
