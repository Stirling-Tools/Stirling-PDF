import { FullscreenToolStyleSettings, defaultFullscreenToolSettings } from '../../components/tools/FullscreenToolSettings';
import { PageEditorFunctions } from '../../types/pageEditor';

// State & Modes
export type ToolPanelMode = 'sidebar' | 'fullscreen';

export interface ToolWorkflowState {
  // UI State
  sidebarsVisible: boolean;
  leftPanelView: 'toolPicker' | 'toolContent' | 'hidden';
  readerMode: boolean;
  toolPanelMode: ToolPanelMode;
  fullscreenToolSettings: FullscreenToolStyleSettings;

  // File/Preview State
  previewFile: File | null;
  pageEditorFunctions: PageEditorFunctions | null;

  // Search State
  searchQuery: string;
}

// Actions
export type ToolWorkflowAction =
  | { type: 'SET_SIDEBARS_VISIBLE'; payload: boolean }
  | { type: 'SET_LEFT_PANEL_VIEW'; payload: 'toolPicker' | 'toolContent' | 'hidden' }
  | { type: 'SET_READER_MODE'; payload: boolean }
  | { type: 'SET_TOOL_PANEL_MODE'; payload: ToolPanelMode }
  | { type: 'SET_FULLSCREEN_TOOL_SETTINGS'; payload: FullscreenToolStyleSettings }
  | { type: 'SET_PREVIEW_FILE'; payload: File | null }
  | { type: 'SET_PAGE_EDITOR_FUNCTIONS'; payload: PageEditorFunctions | null }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'RESET_UI_STATE' };

// Storage keys
export const TOOL_PANEL_MODE_STORAGE_KEY = 'toolPanelModePreference';
export const FULLSCREEN_TOOL_SETTINGS_STORAGE_KEY = 'fullscreenToolStyleSettings';

export const getStoredToolPanelMode = (): ToolPanelMode => {
  if (typeof window === 'undefined') {
    return 'sidebar';
  }

  const stored = window.localStorage.getItem(TOOL_PANEL_MODE_STORAGE_KEY);
  if (stored === 'fullscreen') {
    return 'fullscreen';
  }

  return 'sidebar';
};

export const getStoredFullscreenToolSettings = (): FullscreenToolStyleSettings => {
  if (typeof window === 'undefined') {
    return defaultFullscreenToolSettings;
  }

  try {
    const storedNew = window.localStorage.getItem(FULLSCREEN_TOOL_SETTINGS_STORAGE_KEY);
    if (storedNew) {
      return { ...defaultFullscreenToolSettings, ...JSON.parse(storedNew) };
    }
  } catch (e) {
    console.error('Failed to parse fullscreen tool settings:', e);
  }

  return defaultFullscreenToolSettings;
};

export const baseState: Omit<ToolWorkflowState, 'toolPanelMode' | 'fullscreenToolSettings'> = {
  sidebarsVisible: true,
  leftPanelView: 'toolPicker',
  readerMode: false,
  previewFile: null,
  pageEditorFunctions: null,
  searchQuery: '',
};

export const createInitialState = (): ToolWorkflowState => ({
  ...baseState,
  toolPanelMode: getStoredToolPanelMode(),
  fullscreenToolSettings: getStoredFullscreenToolSettings(),
});

export function toolWorkflowReducer(state: ToolWorkflowState, action: ToolWorkflowAction): ToolWorkflowState {
  switch (action.type) {
    case 'SET_SIDEBARS_VISIBLE':
      return { ...state, sidebarsVisible: action.payload };
    case 'SET_LEFT_PANEL_VIEW':
      return { ...state, leftPanelView: action.payload };
    case 'SET_READER_MODE':
      return { ...state, readerMode: action.payload };
    case 'SET_TOOL_PANEL_MODE':
      return { ...state, toolPanelMode: action.payload };
    case 'SET_FULLSCREEN_TOOL_SETTINGS':
      return { ...state, fullscreenToolSettings: action.payload };
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
        fullscreenToolSettings: state.fullscreenToolSettings,
        searchQuery: state.searchQuery,
      };
    default:
      return state;
  }
}


