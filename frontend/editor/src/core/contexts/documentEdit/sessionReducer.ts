/**
 * Canonical edit state for one open document.
 *
 * The phases exist because independent booleans admit invalid combinations: a
 * committed redaction whose save failed, an apply in flight while the UI still
 * offers it, a document called saved before the output was persisted. A reducer
 * makes those states unrepresentable rather than guarding each call site.
 *
 * The session owns decisions. It never owns DOM geometry, menu state, or tool
 * selection; only the persistence pipeline changes the durable document.
 */

export type SaveSurface = "hidden" | "visible";
export type RedactionPhase = "idle" | "drafting" | "applying" | "failed";
export type PersistencePhase = "idle" | "saving" | "failed";

export interface UserFacingError {
  /** Message shown to the user. Never an untranslated exception string. */
  message: string;
}

export interface SessionState {
  /** Identity of the document these edits belong to. */
  documentId: string | null;
  /** Revision the persisted file is known to contain. */
  savedRevision: number;
  /** Revision the working document has reached, saved or not. */
  workingRevision: number;

  annotation: {
    dirty: boolean;
    saveSurface: SaveSurface;
  };

  redaction: {
    pendingCount: number;
    phase: RedactionPhase;
    error: UserFacingError | null;
  };

  persistence: {
    phase: PersistencePhase;
    error: UserFacingError | null;
  };
}

export type SessionAction =
  | { type: "DOCUMENT_REPLACED"; documentId: string }
  | { type: "ANNOTATION_EDIT_COMMITTED" }
  | { type: "ANNOTATION_SAVE_REQUESTED" }
  | { type: "ANNOTATION_SAVE_SUCCEEDED"; revision: number }
  | { type: "ANNOTATION_SAVE_FAILED"; error: UserFacingError }
  | { type: "REDACTION_DRAFT_ADDED" }
  | { type: "REDACTION_DRAFT_REMOVED" }
  | { type: "REDACTION_APPLY_REQUESTED" }
  | { type: "REDACTION_APPLY_SUCCEEDED"; revision: number }
  | {
      type: "OPERATION_FAILED";
      operation: "save" | "redaction";
      error: UserFacingError;
    };

export function initialSessionState(): SessionState {
  return {
    documentId: null,
    savedRevision: 0,
    workingRevision: 0,
    annotation: { dirty: false, saveSurface: "hidden" },
    redaction: { pendingCount: 0, phase: "idle", error: null },
    persistence: { phase: "idle", error: null },
  };
}

/** A new document resets everything through this one transition. */
function forNewDocument(state: SessionState, documentId: string): SessionState {
  const fresh = initialSessionState();
  // Keeping the revision counters monotonic across documents would let a stale
  // save from the previous document look current, so they reset too.
  return {
    ...fresh,
    documentId,
    savedRevision: state.savedRevision,
    workingRevision: state.workingRevision,
  };
}

export function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "DOCUMENT_REPLACED":
      return forNewDocument(state, action.documentId);

    case "ANNOTATION_EDIT_COMMITTED":
      // An edit that lands while a save is in flight stays unsaved: the save only
      // covers the revision it snapshotted.
      return {
        ...state,
        workingRevision: state.workingRevision + 1,
        annotation: { dirty: true, saveSurface: "visible" },
      };

    case "ANNOTATION_SAVE_REQUESTED":
      return { ...state, persistence: { phase: "saving", error: null } };

    case "ANNOTATION_SAVE_SUCCEEDED":
      return {
        ...state,
        savedRevision: action.revision,
        // Only the work the save covered is clean. An edit that landed during the
        // save already bumped workingRevision above the saved revision.
        annotation: {
          dirty: state.workingRevision > action.revision,
          saveSurface:
            state.workingRevision > action.revision ? "visible" : "hidden",
        },
        persistence: { phase: "idle", error: null },
      };

    case "ANNOTATION_SAVE_FAILED":
      return {
        ...state,
        annotation: { dirty: true, saveSurface: "visible" },
        persistence: { phase: "failed", error: action.error },
      };

    case "REDACTION_DRAFT_ADDED":
      return {
        ...state,
        redaction: {
          ...state.redaction,
          pendingCount: state.redaction.pendingCount + 1,
          phase: "drafting",
          error: null,
        },
      };

    case "REDACTION_DRAFT_REMOVED":
      return {
        ...state,
        redaction: {
          ...state.redaction,
          pendingCount: Math.max(0, state.redaction.pendingCount - 1),
        },
      };

    case "REDACTION_APPLY_REQUESTED":
      // Single-flight by construction: a second request while applying is ignored
      // rather than queued, so a double click cannot start a second commit/save.
      if (
        state.redaction.phase === "applying" ||
        state.redaction.pendingCount === 0
      )
        return state;
      return {
        ...state,
        redaction: { ...state.redaction, phase: "applying", error: null },
      };

    case "REDACTION_APPLY_SUCCEEDED":
      return {
        ...state,
        workingRevision: action.revision,
        savedRevision: action.revision,
        // Drafts are only cleared once the output is persisted.
        redaction: { pendingCount: 0, phase: "idle", error: null },
      };

    case "OPERATION_FAILED":
      if (action.operation === "redaction") {
        return {
          ...state,
          // Drafts are retained so the operation stays retryable.
          redaction: {
            ...state.redaction,
            phase: "failed",
            error: action.error,
          },
        };
      }
      return {
        ...state,
        annotation: { dirty: true, saveSurface: "visible" },
        persistence: { phase: "failed", error: action.error },
      };

    default:
      return state;
  }
}
