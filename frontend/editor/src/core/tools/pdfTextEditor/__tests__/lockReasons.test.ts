import { describe, expect, it } from "vitest";
import { SetLockCommand } from "@app/tools/pdfTextEditor/commands/SetLockCommand";
import { TextRun } from "@app/tools/pdfTextEditor/model/TextRun";
import { Page } from "@app/tools/pdfTextEditor/model/Page";
import type { EditorDocument } from "@app/tools/pdfTextEditor/model/EditorDocument";

function makeRun(locked: boolean, reason: string | null): TextRun {
  return new TextRun({
    id: "r1",
    pageIndex: 0,
    pdfiumObjPtr: 5,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
    text: "abc",
    fontId: "base14:Helvetica",
    fontSize: 10,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    fontSubset: false,
    locked,
    lockReason: reason ?? undefined,
  });
}

function makeDoc(run: TextRun): EditorDocument {
  const page = new Page({ index: 0, pagePtr: 1, width: 100, height: 100 });
  page.setRuns([run]);
  return {
    page: () => page,
    loadedPages: () => [page],
  } as unknown as EditorDocument;
}

describe("lock reasons", () => {
  it("a manual lock keeps the run locked and a manual unlock clears the reason", () => {
    const run = makeRun(
      true,
      "Right-to-left text is read-only in this editor.",
    );
    const doc = makeDoc(run);
    new SetLockCommand({ pageIndex: 0, runId: "r1", locked: false }).apply(doc);
    expect(run.locked).toBe(false);
    expect(run.lockReason).toBeNull();
  });

  it("undo restores both the lock state and its reason", () => {
    const run = makeRun(true, "Some glyphs in this run could not be decoded.");
    const doc = makeDoc(run);
    const cmd = new SetLockCommand({
      pageIndex: 0,
      runId: "r1",
      locked: false,
    });
    cmd.apply(doc);
    cmd.revert(doc);
    expect(run.locked).toBe(true);
    expect(run.lockReason).toBe(
      "Some glyphs in this run could not be decoded.",
    );
  });

  it("snapshots carry the reason so the overlay can show it", () => {
    const run = makeRun(
      true,
      "Right-to-left text is read-only in this editor.",
    );
    expect(run.snapshot().lockReason).toBe(
      "Right-to-left text is read-only in this editor.",
    );
    expect(run.snapshot().locked).toBe(true);
  });
});
