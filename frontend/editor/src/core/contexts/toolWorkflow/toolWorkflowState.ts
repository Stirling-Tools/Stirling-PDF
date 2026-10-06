import { type ToolPanelMode } from "@app/constants/toolPanel";
import { preferencesService } from "@app/services/preferencesService";
import { stripBasePath } from "@app/constants/app";
import { READER_PATH } from "@app/routes/readerRoute";

export interface ToolWorkflowState {
  // UI State
  leftPanelView: "toolPicker" | "toolContent";
  readerMode: boolean;
  toolPanelMode: ToolPanelMode;

  previewFile: File | null;

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
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "RESET_UI_STATE" };

export const baseState: Omit<ToolWorkflowState, "toolPanelMode"> = {
  leftPanelView: "toolPicker",
  readerMode: false,
  previewFile: null,
  searchQuery: "",
};

/**
 * Reading is seeded from the path rather than switched on by an effect after the
 * first paint, so a reload at the reader's own URL never paints the editor and
 * then animates it away.
 */
function startsInReader(): boolean {
  if (typeof window === "undefined") return false;
  return stripBasePath(window.location.pathname).startsWith(READER_PATH);
}

export const createInitialState = (): ToolWorkflowState => ({
  ...baseState,
  readerMode: startsInReader(),
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
