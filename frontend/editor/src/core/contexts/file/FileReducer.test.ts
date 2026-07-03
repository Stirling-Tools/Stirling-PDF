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

describe("fileContextReducer — silent CONSUME_FILES (background enforcement)", () => {
  it("replaces the input in its existing slot without moving the output to the front", () => {
    const start = stateWith([stub("a"), stub("b"), stub("c")]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["b" as FileId],
        outputStirlingFileStubs: [stub("b2")],
        silent: true,
      },
    });
    // b2 takes b's middle slot — not the front (which is what non-silent does).
    expect(next.files.ids).toEqual(["a", "b2", "c"]);
  });

  it("does not auto-select the output (nothing was selected)", () => {
    const start = stateWith([stub("a")]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["a" as FileId],
        outputStirlingFileStubs: [stub("a2")],
        silent: true,
      },
    });
    expect(next.ui.selectedFileIds).toEqual([]);
  });

  it("preserves selection: a selected input's replacement stays selected in place", () => {
    const start = {
      ...stateWith([stub("a"), stub("b")]),
      ui: { ...initialFileContextState.ui, selectedFileIds: ["b" as FileId] },
    };
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["b" as FileId],
        outputStirlingFileStubs: [stub("b2")],
        silent: true,
      },
    });
    expect(next.ui.selectedFileIds).toEqual(["b2"]);
  });

  it("is a no-op on the workbench when the input was already closed", () => {
    // The file was removed from the workspace while its run was in flight; the
    // finished run must NOT re-add it (it's already persisted to storage).
    const start = stateWith([stub("other")]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["gone" as FileId],
        outputStirlingFileStubs: [stub("gone2")],
        silent: true,
      },
    });
    expect(next.files.ids).toEqual(["other"]);
    expect(next.files.byId["gone2" as FileId]).toBeUndefined();
  });

  it("carries classificationCategory forward from input to output", () => {
    // A classified file "a" is edited by a tool → "b" (which carries no category
    // of its own). The output must inherit the category so it stays in its group
    // instead of dropping to "Other" and waiting on a PDF re-read.
    const start = stateWith([
      stub("a", {
        classificationCategory: { id: "invoice", label: "Invoice" },
      }),
    ]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["a" as FileId],
        outputStirlingFileStubs: [stub("b")],
      },
    });
    expect(next.files.byId["b" as FileId].classificationCategory).toEqual({
      id: "invoice",
      label: "Invoice",
    });
  });

  it("an output's own classificationCategory wins over the input's", () => {
    // A re-classify produces an output that already carries a (fresher) category.
    const start = stateWith([
      stub("a", {
        classificationCategory: { id: "invoice", label: "Invoice" },
      }),
    ]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["a" as FileId],
        outputStirlingFileStubs: [
          stub("b", {
            classificationCategory: { id: "contract", label: "Contract" },
          }),
        ],
      },
    });
    expect(next.files.byId["b" as FileId].classificationCategory?.id).toBe(
      "contract",
    );
  });

  it("non-silent CONSUME_FILES still moves the output to the front (unchanged)", () => {
    const start = stateWith([stub("a"), stub("b")]);
    const next = fileContextReducer(start, {
      type: "CONSUME_FILES",
      payload: {
        inputFileIds: ["b" as FileId],
        outputStirlingFileStubs: [stub("b2")],
      },
    });
    expect(next.files.ids).toEqual(["b2", "a"]);
    expect(next.ui.selectedFileIds).toEqual(["b2"]);
  });
});
