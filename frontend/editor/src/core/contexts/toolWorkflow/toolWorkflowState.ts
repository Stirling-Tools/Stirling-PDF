import { PageEditorFunctions } from "@app/types/pageEditor";
import { type ToolPanelMode } from "@app/constants/toolPanel";
import { preferencesService } from "@app/services/preferencesService";

export interface ToolWorkflowState {
  // UI State
  leftPanelView: "toolPicker" | "toolContent";
  readerMode: boolean;
  toolPanelMode: ToolPanelMode;

  previewFile: File | null;
  pageEditorFunctions: PageEditorFunctions | null;

  // Search State
  searchQuery: string;
}

// Actions
export type ToolWorkflowAction =
  | {
      type: "SET_LEFT_PANEL_VIEW";
      payload: "toolPicker" | "toolContent";
    }
  | { type: "SET_READER_MODE"; payload: boolean }
  | { type: "SET_TOOL_PANEL_MODE"; payload: ToolPanelMode }
  | { type: "SET_PREVIEW_FILE"; payload: File | null }
  | { type: "SET_PAGE_EDITOR_FUNCTIONS"; payload: PageEditorFunctions | null }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "RESET_UI_STATE" };

export const baseState: Omit<ToolWorkflowState, "toolPanelMode"> = {
  leftPanelView: "toolPicker",
  readerMode: false,
  previewFile: null,
  pageEditorFunctions: null,
  searchQuery: "",
};

export const createInitialState = (): ToolWorkflowState => ({
  ...baseState,
  toolPanelMode: preferencesService.getPreference("defaultToolPanelMode"),
});

export function toolWorkflowReducer(
  state: ToolWorkflowState,
  action: ToolWorkflowAction,
): ToolWorkflowState {
  switch (action.type) {
    case "SET_LEFT_PANEL_VIEW":
      return { ...state, leftPanelView: action.payload };
    case "SET_READER_MODE":
      return { ...state, readerMode: action.payload };
    case "SET_TOOL_PANEL_MODE":
      return { ...state, toolPanelMode: action.payload };
    case "SET_PREVIEW_FILE":
      return { ...state, previewFile: action.payload };
    case "SET_PAGE_EDITOR_FUNCTIONS":
      return { ...state, pageEditorFunctions: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };
    case "RESET_UI_STATE":
      return {
        ...baseState,
        toolPanelMode: state.toolPanelMode,
        searchQuery: state.searchQuery,
      };
    default:
      return state;
  }
}
