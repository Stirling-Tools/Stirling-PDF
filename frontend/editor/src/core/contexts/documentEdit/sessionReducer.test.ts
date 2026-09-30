import { describe, expect, it } from "vitest";
import {
  initialSessionState,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from "@app/contexts/documentEdit/sessionReducer";

const err = { message: "boom" };

function reduce(
  actions: SessionAction[],
  from: SessionState = initialSessionState(),
): SessionState {
  return actions.reduce(sessionReducer, from);
}

const withDoc = (s: SessionState = initialSessionState()) =>
  reduce([{ type: "DOCUMENT_REPLACED", documentId: "doc-1" }], s);

describe("sessionReducer", () => {
  it("surfaces the save surface on an annotation edit without any tool change", () => {
    const state = reduce([{ type: "ANNOTATION_EDIT_COMMITTED" }], withDoc());
    expect(state.annotation.dirty).toBe(true);
    expect(state.annotation.saveSurface).toBe("visible");
    expect(state.persistence.phase).toBe("idle");
  });

  it("clears the save surface only when the save covered every edit", () => {
    const saved = reduce(
      [
        { type: "ANNOTATION_EDIT_COMMITTED" },
        { type: "ANNOTATION_SAVE_REQUESTED" },
        { type: "ANNOTATION_SAVE_SUCCEEDED", revision: 1 },
      ],
      withDoc(),
    );
    expect(saved.annotation).toEqual({ dirty: false, saveSurface: "hidden" });
  });

  // An edit that lands while a save is in flight is not covered by that save, so
  // clearing the surface there would hide unsaved work.
  it("keeps the surface visible when an edit lands during the save", () => {
    const state = reduce(
      [
        { type: "ANNOTATION_EDIT_COMMITTED" },
        { type: "ANNOTATION_SAVE_REQUESTED" },
        { type: "ANNOTATION_EDIT_COMMITTED" },
        { type: "ANNOTATION_SAVE_SUCCEEDED", revision: 1 },
      ],
      withDoc(),
    );
    expect(state.annotation).toEqual({ dirty: true, saveSurface: "visible" });
  });

  it("keeps the document dirty and retryable when a save fails", () => {
    const state = reduce(
      [
        { type: "ANNOTATION_EDIT_COMMITTED" },
        { type: "ANNOTATION_SAVE_REQUESTED" },
        { type: "ANNOTATION_SAVE_FAILED", error: err },
      ],
      withDoc(),
    );
    expect(state.annotation.dirty).toBe(true);
    expect(state.persistence).toEqual({ phase: "failed", error: err });
  });

  it("ignores a second apply while one is in flight", () => {
    const applying = reduce(
      [
        { type: "REDACTION_DRAFT_ADDED" },
        { type: "REDACTION_APPLY_REQUESTED" },
      ],
      withDoc(),
    );
    const twice = sessionReducer(applying, {
      type: "REDACTION_APPLY_REQUESTED",
    });
    expect(twice).toBe(applying);
  });

  it("refuses to apply with nothing pending", () => {
    const idle = withDoc();
    expect(sessionReducer(idle, { type: "REDACTION_APPLY_REQUESTED" })).toBe(
      idle,
    );
  });

  it("retains drafts and the retry path when an apply fails", () => {
    const state = reduce(
      [
        { type: "REDACTION_DRAFT_ADDED" },
        { type: "REDACTION_DRAFT_ADDED" },
        { type: "REDACTION_APPLY_REQUESTED" },
        {
          type: "OPERATION_FAILED",
          operation: "redaction",
          error: err,
        },
      ],
      withDoc(),
    );
    expect(state.redaction.pendingCount).toBe(2);
    expect(state.redaction.phase).toBe("failed");
    expect(state.redaction.error).toBe(err);
  });

  it("can retry after a failed apply", () => {
    const failed = reduce(
      [
        { type: "REDACTION_DRAFT_ADDED" },
        { type: "REDACTION_APPLY_REQUESTED" },
        { type: "OPERATION_FAILED", operation: "redaction", error: err },
      ],
      withDoc(),
    );
    const retried = sessionReducer(failed, {
      type: "REDACTION_APPLY_REQUESTED",
    });
    expect(retried.redaction.phase).toBe("applying");
  });

  // The drafts are only cleared once the output is persisted.
  it("clears redaction drafts only on a verified apply", () => {
    const state = reduce(
      [
        { type: "REDACTION_DRAFT_ADDED" },
        { type: "REDACTION_APPLY_REQUESTED" },
        { type: "REDACTION_APPLY_SUCCEEDED", revision: 4 },
      ],
      withDoc(),
    );
    expect(state.redaction).toEqual({
      pendingCount: 0,
      phase: "idle",
      error: null,
    });
    expect(state.savedRevision).toBe(4);
  });

  it("never lets the pending count go negative", () => {
    const state = reduce(
      [
        { type: "REDACTION_DRAFT_REMOVED" },
        { type: "REDACTION_DRAFT_REMOVED" },
      ],
      withDoc(),
    );
    expect(state.redaction.pendingCount).toBe(0);
  });

  // One transition, not several component effects clearing flags.
  it("resets the whole session for a new document", () => {
    const dirty = reduce(
      [
        { type: "ANNOTATION_EDIT_COMMITTED" },
        { type: "REDACTION_DRAFT_ADDED" },
        { type: "ANNOTATION_SAVE_FAILED", error: err },
      ],
      withDoc(),
    );
    const swapped = sessionReducer(dirty, {
      type: "DOCUMENT_REPLACED",
      documentId: "doc-2",
    });

    expect(swapped.documentId).toBe("doc-2");
    expect(swapped.annotation).toEqual({ dirty: false, saveSurface: "hidden" });
    expect(swapped.redaction.pendingCount).toBe(0);
    expect(swapped.persistence).toEqual({ phase: "idle", error: null });
  });

  // Revisions stay monotonic across documents so a late save from the previous
  // document cannot present itself as covering the new one's edits.
  it("keeps revision counters monotonic across a document swap", () => {
    const saved = reduce(
      [
        { type: "ANNOTATION_EDIT_COMMITTED" },
        { type: "ANNOTATION_SAVE_REQUESTED" },
        { type: "ANNOTATION_SAVE_SUCCEEDED", revision: 7 },
      ],
      withDoc(),
    );
    expect(saved.savedRevision).toBe(7);

    const swapped = sessionReducer(saved, {
      type: "DOCUMENT_REPLACED",
      documentId: "doc-2",
    });
    expect(swapped.savedRevision).toBe(7);
    expect(swapped.annotation.dirty).toBe(false);
  });
});
