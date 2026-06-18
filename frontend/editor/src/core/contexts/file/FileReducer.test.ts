import { describe, it, expect } from "vitest";
import {
  fileContextReducer,
  initialFileContextState,
} from "@app/contexts/file/FileReducer";
import type {
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

function stub(
  id: string,
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub {
  return {
    id: id as FileId,
    name: `${id}.pdf`,
    type: "application/pdf",
    size: 1,
    lastModified: 0,
    isLeaf: true,
    originalFileId: id,
    versionNumber: 1,
    ...overrides,
  };
}

function stateWith(stubs: StirlingFileStub[]): FileContextState {
  return {
    ...initialFileContextState,
    files: {
      ids: stubs.map((s) => s.id),
      byId: Object.fromEntries(stubs.map((s) => [s.id, s])),
    },
  };
}

describe("fileContextReducer — derivedFromTool provenance", () => {
  it("ADD_FILES leaves uploads unmarked (a genuine upload is not tool-derived)", () => {
    const next = fileContextReducer(initialFileContextState, {
      type: "ADD_FILES",
      payload: { stirlingFileStubs: [stub("a")] },
    });
    expect(next.files.byId["a" as FileId].derivedFromTool).toBeUndefined();
  });

  it("CONSUME_FILES marks every output as tool-derived", () => {
    // An upload "a" is consumed by a tool producing an independent artifact "b"
    // (version metadata identical to an upload — only the flag distinguishes it).
    const next = fileContextReducer(stateWith([stub("a")]), {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["a" as FileId],
        outputStirlingFileStubs: [stub("b")],
      },
    });
    expect(next.files.byId["b" as FileId].derivedFromTool).toBe(true);
    // Provenance: "b" records the input it derived from.
    expect(next.files.byId["b" as FileId].sourceFileIds).toEqual(["a"]);
    expect(next.files.byId["a" as FileId]).toBeUndefined(); // input consumed
  });

  it("CONSUME_FILES accumulates sourceFileIds transitively", () => {
    // "b" already derived from "a"; consuming "b" → "c" carries both, so the
    // badge still resolves after the intermediate "b" is gone (e.g. split).
    const start = stateWith([stub("b", { sourceFileIds: ["a" as FileId] })]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["b" as FileId],
        outputStirlingFileStubs: [stub("c")],
      },
    });
    expect(next.files.byId["c" as FileId].sourceFileIds).toEqual(["b", "a"]);
  });

  it("CONSUME_FILES with multiple inputs (merge) records all sources", () => {
    const start = stateWith([stub("a"), stub("b")]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["a" as FileId, "b" as FileId],
        outputStirlingFileStubs: [stub("merged")],
      },
    });
    expect(next.files.byId["merged" as FileId].sourceFileIds).toEqual([
      "a",
      "b",
    ]);
  });

  it("UNDO_CONSUME_FILES restores the original upload without mislabelling it", () => {
    // Reverses the swap above: the original upload "a" comes back through the
    // same helper, but must NOT be flagged tool-derived.
    const consumed = fileContextReducer(stateWith([stub("a")]), {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["a" as FileId],
        outputStirlingFileStubs: [stub("b")],
      },
    });
    const undone = fileContextReducer(consumed, {
      type: "UNDO_CONSUME_FILES",
      payload: {
        inputStirlingFileStubs: [stub("a")],
        outputFileIds: ["b" as FileId],
      },
    });
    expect(undone.files.byId["a" as FileId].derivedFromTool).toBeUndefined();
    expect(undone.files.byId["b" as FileId]).toBeUndefined(); // output removed
  });
});
