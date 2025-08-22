/**
 * ToolWorkflowContext - Manages tool selection, UI state, and workflow coordination
 * Eliminates prop drilling with a single, simple context
 */

import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { useToolManagement } from '../hooks/useToolManagement';
import { PageEditorFunctions } from '../types/pageEditor';
import { ToolRegistryEntry } from '../data/toolsTaxonomy';
import { useToolWorkflowUrlSync } from '../hooks/useUrlSync';

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
  /** Handler for view changes (passed from parent) */
  onViewChange?: (view: string) => void;
  /** Enable URL synchronization for tool selection */
  enableUrlSync?: boolean;
}

export function ToolWorkflowProvider({ children, onViewChange, enableUrlSync = true }: ToolWorkflowProviderProps) {
  const [state, dispatch] = useReducer(toolWorkflowReducer, initialState);

  // Tool management hook
  const {
    selectedToolKey,
    selectedTool,
    toolRegistry,
    selectTool,
    clearToolSelection,
  } = useToolManagement();

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
  }, []);

  const setPageEditorFunctions = useCallback((functions: PageEditorFunctions | null) => {
    dispatch({ type: 'SET_PAGE_EDITOR_FUNCTIONS', payload: functions });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  }, []);

  // Workflow actions (compound actions that coordinate multiple state changes)
  const handleToolSelect = useCallback((toolId: string) => {
    // Special-case: if tool is a dedicated reader tool, enter reader mode and do not go to toolContent
    if (toolId === 'read' || toolId === 'view-pdf') {
      setReaderMode(true);
      setLeftPanelView('toolPicker');
      clearToolSelection();
      setSearchQuery('');
      return;
    }

    selectTool(toolId);
    onViewChange?.('fileEditor');
    setLeftPanelView('toolContent');
    setReaderMode(false);
    // Clear search so the tool content becomes visible immediately
    setSearchQuery('');
  }, [selectTool, onViewChange, setLeftPanelView, setReaderMode, setSearchQuery, clearToolSelection]);

  const handleBackToTools = useCallback(() => {
    setLeftPanelView('toolPicker');
    setReaderMode(false);
    clearToolSelection();
  }, [setLeftPanelView, setReaderMode, clearToolSelection]);

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
  useToolWorkflowUrlSync(selectedToolKey, selectTool, clearToolSelection, enableUrlSync);

  // Simple context value with basic memoization
  const contextValue = useMemo((): ToolWorkflowContextValue => ({
    // State
    ...state,
    selectedToolKey,
    selectedTool,
    toolRegistry,

    // Actions
    setSidebarsVisible,
    setLeftPanelView,
    setReaderMode,
    setPreviewFile,
    setPageEditorFunctions,
    setSearchQuery,
    selectTool,
    clearToolSelection,

    // Workflow Actions
    handleToolSelect,
    handleBackToTools,
    handleReaderToggle,

    // Computed
    filteredTools,
    isPanelVisible,
  }), [state, selectedToolKey, selectedTool, toolRegistry, filteredTools, isPanelVisible]);

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
    throw new Error('useToolWorkflow must be used within a ToolWorkflowProvider');
  }
  return context;
}
