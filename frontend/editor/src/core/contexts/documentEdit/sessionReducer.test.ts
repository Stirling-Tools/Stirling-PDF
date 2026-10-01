import { describe, expect, it } from "vitest";
import {
  initialSessionState,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from "@app/contexts/documentEdit/sessionReducer";

function reduce(
  actions: SessionAction[],
  from: SessionState = initialSessionState(),
): SessionState {
  return actions.reduce(sessionReducer, from);
}

describe("sessionReducer", () => {
  it("counts each committed edit", () => {
    const state = reduce([
      { type: "ANNOTATION_EDIT_COMMITTED" },
      { type: "ANNOTATION_EDIT_COMMITTED" },
    ]);
    expect(state.workingRevision).toBe(2);
  });

  // EmbedPdfViewer reopens the Annotate UI whenever workingRevision moves, so a
  // new document must start back at zero rather than inheriting the swap's
  // revision and firing the open effect on mount.
  it("resets the revision for a new document", () => {
    const edited = reduce([
      { type: "ANNOTATION_EDIT_COMMITTED" },
      { type: "DOCUMENT_REPLACED" },
    ]);
    expect(edited.workingRevision).toBe(0);
  });

  it("keeps counting after a document swap", () => {
    const state = reduce([
      { type: "ANNOTATION_EDIT_COMMITTED" },
      { type: "DOCUMENT_REPLACED" },
      { type: "ANNOTATION_EDIT_COMMITTED" },
    ]);
    expect(state.workingRevision).toBe(1);
  });
});
