import { describe, it, expect } from "vitest";
import { fileContextReducer } from "@app/contexts/file/FileReducer";
import type {
  FileContextAction,
  FileContextState,
  StirlingFileStub,
} from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/**
 * Classification is non-blocking: while it runs, the user can manually run a
 * tool on the same file. Classification's only write is a metadata-only,
 * shallow-merged UPDATE_FILE_RECORD stamping `classificationLabels`; a manual
 * tool run produces a NEW document via CONSUME_FILES (new id + version). These
 * tests drive the REAL reducer through every interleaving (classification lands
 * before / during / after the tool run) and prove the invariant the design
 * relies on: the tool's output document is byte-for-byte what the tool produced,
 * regardless of when classification lands. The only thing that varies is the
 * label CACHE (which can be lost in the mid-run race — documented below).
 */

const stub = (
  id: string,
  extra: Partial<StirlingFileStub> = {},
): StirlingFileStub =>
  ({
    id: id as FileId,
    name: "doc.pdf",
    versionNumber: 1,
    ...extra,
  }) as StirlingFileStub;

function stateWith(...stubs: StirlingFileStub[]): FileContextState {
  return {
    files: {
      ids: stubs.map((s) => s.id),
      byId: Object.fromEntries(stubs.map((s) => [s.id, s])) as Record<
        FileId,
        StirlingFileStub
      >,
    },
    pinnedFiles: new Set<FileId>(),
    ui: {
      selectedFileIds: [],
      selectedPageNumbers: [],
      isProcessing: false,
      processingProgress: 0,
      hasUnsavedChanges: false,
      errorFileIds: [],
    },
  };
}

const LABELS = ["Invoice"];

// A manual tool run on `inputId` producing a new versioned document `outputId`.
// Mirrors what useToolOperation dispatches: the reducer stamps provenance
// (derivedFromTool, sourceFileIds) and inherits labels itself.
const toolRun = (inputId: string, outputId: string): FileContextAction => ({
  type: "CONSUME_FILES",
  payload: {
    inputFileIds: [inputId as FileId],
    outputStirlingFileStubs: [stub(outputId, { versionNumber: 2 })],
    silent: false,
  },
});

// Classification stamping labels onto a target id (the reducer merges shallowly).
const classify = (targetId: string): FileContextAction => ({
  type: "UPDATE_FILE_RECORD",
  payload: {
    id: targetId as FileId,
    updates: { classificationLabels: LABELS },
  },
});

describe("classification landing vs a manually-run tool", () => {
  it("PRE: classification lands first — tool output is correct AND inherits the label", () => {
    let s = stateWith(stub("orig"));
    s = fileContextReducer(s, classify("orig"));
    s = fileContextReducer(s, toolRun("orig", "out"));

    const out = s.files.byId["out" as FileId];
    expect(out).toBeDefined();
    expect(out.versionNumber).toBe(2); // the document the tool produced
    expect(s.files.byId["orig" as FileId]).toBeUndefined(); // input consumed
    // Label carried forward onto the tool's new version.
    expect(out.classificationLabels).toEqual(LABELS);
  });

  it("POST: classification lands after the tool run, targeting the new leaf — output untouched, label applied, nothing else clobbered", () => {
    let s = stateWith(stub("orig"));
    s = fileContextReducer(s, toolRun("orig", "out"));

    const before = s.files.byId["out" as FileId];
    // classificationLabelTargets resolves the run's descendants: "out" matches
    // because its sourceFileIds includes "orig".
    expect(before.sourceFileIds).toContain("orig" as FileId);

    s = fileContextReducer(s, classify("out"));
    const after = s.files.byId["out" as FileId];

    // The label write is a shallow merge: ONLY classificationLabels changes.
    expect(after.classificationLabels).toEqual(LABELS);
    expect({ ...after, classificationLabels: undefined }).toEqual({
      ...before,
      classificationLabels: undefined,
    });
    expect(after.versionNumber).toBe(2);
  });

  it("MID (the race): tool swaps the file between classification's target snapshot and its write — output document is CORRECT; only the label cache is lost", () => {
    let s = stateWith(stub("orig"));

    // Classification snapshotted its target as ["orig"] at run-completion time,
    // BEFORE downloading/parsing the classified PDF (the async window).
    const staleTargetId = "orig";

    // During that window the user runs a tool: orig -> out. orig had no labels
    // yet, so the new leaf inherits none.
    s = fileContextReducer(s, toolRun("orig", "out"));
    const out = s.files.byId["out" as FileId];
    expect(out.versionNumber).toBe(2);
    expect(out.classificationLabels).toBeUndefined();

    // Classification's write finally lands — on the now-consumed snapshot id.
    const beforeWrite = s;
    s = fileContextReducer(s, classify(staleTargetId));

    // No-op on a missing record: reducer returns the SAME state reference, so no
    // zombie "orig" record is resurrected and nothing is corrupted.
    expect(s).toBe(beforeWrite);
    expect(s.files.byId["orig" as FileId]).toBeUndefined();

    // The tool's output document is intact and exactly what the tool produced.
    const finalOut = s.files.byId["out" as FileId];
    expect(finalOut.versionNumber).toBe(2);
    expect(finalOut.sourceFileIds).toContain("orig" as FileId);
    // The label is LOST from the cache in this interleaving (documented gap):
    // it neither inherited (orig was unlabelled at consume) nor landed (write
    // no-oped on the stale id). The DOCUMENT is unaffected.
    expect(finalOut.classificationLabels).toBeUndefined();
  });

  it("classification can never overwrite a tool output's document fields (only the label)", () => {
    // Tool output already carries its own state; classification must not disturb it.
    let s = stateWith(
      stub("out", {
        versionNumber: 7,
        thumbnailUrl: "blob:thumb",
        isPinned: true,
      } as Partial<StirlingFileStub>),
    );

    s = fileContextReducer(s, classify("out"));
    const after = s.files.byId["out" as FileId];

    expect(after.versionNumber).toBe(7);
    expect(after.thumbnailUrl).toBe("blob:thumb");
    expect((after as { isPinned?: boolean }).isPinned).toBe(true);
    expect(after.classificationLabels).toEqual(LABELS);
  });
});
