import type {
  RecordedOperationStep,
  WorkflowRecorderDraft,
  WorkflowRecorderState,
} from "@app/types/workflowRecorder";

export type WorkflowRecorderAction =
  | { type: "START_RECORDING"; payload: WorkflowRecorderDraft }
  | { type: "STOP_RECORDING" }
  | { type: "DISCARD_RECORDING" }
  | { type: "ADD_STEP"; payload: RecordedOperationStep }
  | { type: "REMOVE_STEP"; payload: string };

export const initialWorkflowRecorderState: WorkflowRecorderState = {
  isRecording: false,
  draft: null,
};

export function workflowRecorderReducer(
  state: WorkflowRecorderState,
  action: WorkflowRecorderAction,
): WorkflowRecorderState {
  switch (action.type) {
    case "START_RECORDING":
      return {
        isRecording: true,
        draft: action.payload,
      };
    case "STOP_RECORDING":
      return {
        ...state,
        isRecording: false,
      };
    case "DISCARD_RECORDING":
      return initialWorkflowRecorderState;
    case "ADD_STEP":
      if (!state.draft) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          updatedAt: action.payload.capturedAt,
          steps: [...state.draft.steps, action.payload],
        },
      };
    case "REMOVE_STEP":
      if (!state.draft) {
        return state;
      }
      return {
        ...state,
        draft: {
          ...state.draft,
          updatedAt: new Date().toISOString(),
          steps: state.draft.steps.filter((step) => step.id !== action.payload),
        },
      };
    default:
      return state;
  }
}
