/**
 * Edit revision for one open document: how many committed annotation edits the
 * working document has taken, saved or not. The session owns that count only.
 * It never owns DOM geometry, menu state, or tool selection; the persistence
 * pipeline is what changes the durable document.
 */

export interface SessionState {
  /** Commits the working document has taken, saved or not. */
  workingRevision: number;
}

export type SessionAction =
  | { type: "DOCUMENT_REPLACED" }
  | { type: "ANNOTATION_EDIT_COMMITTED" };

export function initialSessionState(): SessionState {
  return { workingRevision: 0 };
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "DOCUMENT_REPLACED":
      return initialSessionState();

    case "ANNOTATION_EDIT_COMMITTED":
      return { ...state, workingRevision: state.workingRevision + 1 };

    default:
      return state;
  }
}
