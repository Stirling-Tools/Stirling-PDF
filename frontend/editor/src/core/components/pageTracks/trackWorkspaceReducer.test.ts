import { describe, expect, it } from "vitest";

import { FileId } from "@app/types/file";
import { TrackSource, trackSignature } from "@app/components/pageTracks/types";
import {
  TrackEditorState,
  changedTrackIds,
  initialTrackEditorState,
  trackEditorReducer,
} from "@app/components/pageTracks/trackWorkspaceReducer";

const A = "file-a" as FileId;
const B = "file-b" as FileId;

const source = (
  fileId: FileId,
  pageCount: number,
  rotations: number[] = [],
): TrackSource => ({
  fileId,
  pageCount,
  rotations: Array.from({ length: pageCount }, (_, i) => rotations[i] ?? 0),
});

const sync = (state: TrackEditorState, sources: TrackSource[]) =>
  trackEditorReducer(state, { type: "sync", sources });

const pagesOf = (state: TrackEditorState, fileId: FileId) =>
  state.present.tracks[fileId]?.pages ?? [];

const ids = (state: TrackEditorState, fileId: FileId) =>
  pagesOf(state, fileId).map((p) => `${p.sourceFileId}:${p.sourcePageNumber}`);

/** Two files: A with 3 pages (middle one pre-rotated 90), B with 2. */
function twoTracks(): TrackEditorState {
  return sync(initialTrackEditorState, [
    source(A, 3, [0, 90, 0]),
    source(B, 2),
  ]);
}

describe("trackEditorReducer sync", () => {
  it("expands each file into its own track and seeds source rotations", () => {
    const state = twoTracks();
    expect(state.present.order).toEqual([A, B]);
    expect(pagesOf(state, A).map((p) => p.rotation)).toEqual([0, 90, 0]);
    expect(pagesOf(state, B)).toHaveLength(2);
    expect(changedTrackIds(state)).toEqual([]);
  });

  it("keeps pending edits and their dirty state when another file opens", () => {
    let state = twoTracks();
    state = trackEditorReducer(state, {
      type: "delete",
      pageIds: [pagesOf(state, A)[0].id],
    });
    expect(changedTrackIds(state)).toEqual([A]);

    const C = "file-c" as FileId;
    state = sync(state, [source(A, 3, [0, 90, 0]), source(B, 2), source(C, 1)]);

    expect(pagesOf(state, A)).toHaveLength(2);
    // Re-baselining everything here would mark the pending delete as saved.
    expect(changedTrackIds(state)).toEqual([A]);
  });

  it("rebuilds a track whose underlying file changed, discarding its edits", () => {
    let state = twoTracks();
    state = trackEditorReducer(state, {
      type: "delete",
      pageIds: [pagesOf(state, A)[0].id],
    });
    state = sync(state, [source(A, 5), source(B, 2)]);

    expect(pagesOf(state, A)).toHaveLength(5);
    expect(changedTrackIds(state)).toEqual([]);
  });

  it("drops pages sourced from a file that is no longer open", () => {
    let state = twoTracks();
    const moved = pagesOf(state, B).map((p) => p.id);
    state = trackEditorReducer(state, {
      type: "move",
      pageIds: moved,
      targetFileId: A,
      beforePageId: null,
    });
    expect(pagesOf(state, A)).toHaveLength(5);

    state = sync(state, [source(A, 3, [0, 90, 0])]);

    expect(state.present.order).toEqual([A]);
    expect(ids(state, A)).toEqual([`${A}:1`, `${A}:2`, `${A}:3`]);
  });
});

describe("trackEditorReducer operations", () => {
  it("rotates only the given pages, normalising past a full turn", () => {
    let state = twoTracks();
    const [first, second] = pagesOf(state, A);
    state = trackEditorReducer(state, {
      type: "rotate",
      pageIds: [first.id, second.id],
      delta: 270,
    });
    expect(pagesOf(state, A).map((p) => p.rotation)).toEqual([270, 0, 0]);
  });

  it("moves a selection into another track, preserving its order", () => {
    let state = twoTracks();
    const [a1, , a3] = pagesOf(state, A);
    const b2 = pagesOf(state, B)[1];

    state = trackEditorReducer(state, {
      type: "move",
      pageIds: [a3.id, a1.id],
      targetFileId: B,
      beforePageId: b2.id,
    });

    // Order follows the workspace, not the order the ids were passed in.
    expect(ids(state, B)).toEqual([`${B}:1`, `${A}:1`, `${A}:3`, `${B}:2`]);
    expect(ids(state, A)).toEqual([`${A}:2`]);
    expect(changedTrackIds(state)).toEqual([A, B]);
  });

  it("reorders within a track when the anchor is the moved page itself", () => {
    let state = twoTracks();
    const before = trackSignature(pagesOf(state, A));
    const [a1] = pagesOf(state, A);

    state = trackEditorReducer(state, {
      type: "move",
      pageIds: [a1.id],
      targetFileId: A,
      beforePageId: a1.id,
    });

    // A no-op drop must not register as an edit or fill the undo stack.
    expect(trackSignature(pagesOf(state, A))).toEqual(before);
    expect(state.past).toHaveLength(0);
    expect(changedTrackIds(state)).toEqual([]);
  });

  it("appends when the anchor is null", () => {
    let state = twoTracks();
    const [a1] = pagesOf(state, A);
    state = trackEditorReducer(state, {
      type: "move",
      pageIds: [a1.id],
      targetFileId: A,
      beforePageId: null,
    });
    expect(ids(state, A)).toEqual([`${A}:2`, `${A}:3`, `${A}:1`]);
  });

  it("empties a track without removing it, so save can close the file", () => {
    let state = twoTracks();
    state = trackEditorReducer(state, {
      type: "delete",
      pageIds: pagesOf(state, B).map((p) => p.id),
    });
    expect(state.present.order).toContain(B);
    expect(pagesOf(state, B)).toEqual([]);
    expect(changedTrackIds(state)).toEqual([B]);
  });
});

describe("trackEditorReducer history", () => {
  it("undoes and redoes an edit, restoring dirty state each way", () => {
    let state = twoTracks();
    const original = trackSignature(pagesOf(state, A));
    state = trackEditorReducer(state, {
      type: "delete",
      pageIds: [pagesOf(state, A)[1].id],
    });

    state = trackEditorReducer(state, { type: "undo" });
    expect(trackSignature(pagesOf(state, A))).toEqual(original);
    expect(changedTrackIds(state)).toEqual([]);

    state = trackEditorReducer(state, { type: "redo" });
    expect(pagesOf(state, A)).toHaveLength(2);
    expect(changedTrackIds(state)).toEqual([A]);
  });

  it("clears history on a file-set change, since undo could revive dead pages", () => {
    let state = twoTracks();
    state = trackEditorReducer(state, {
      type: "delete",
      pageIds: [pagesOf(state, A)[0].id],
    });
    expect(state.past).toHaveLength(1);

    state = sync(state, [source(A, 3, [0, 90, 0])]);
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
  });

  it("resets back to the last saved baseline", () => {
    let state = twoTracks();
    const original = trackSignature(pagesOf(state, A));
    state = trackEditorReducer(state, {
      type: "rotate",
      pageIds: pagesOf(state, A).map((p) => p.id),
      delta: 90,
    });
    state = trackEditorReducer(state, { type: "reset" });
    expect(trackSignature(pagesOf(state, A))).toEqual(original);
  });
});
