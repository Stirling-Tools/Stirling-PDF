import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Page } from "@editor/tools/pdfTextEditor/model/Page";
import { TextRun } from "@editor/tools/pdfTextEditor/model/TextRun";
import type { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import type { ScanEditState } from "@editor/tools/pdfTextEditor/commands/scanTextEdit";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const { renderScanEdit } = vi.hoisted(() => ({
  renderScanEdit: vi.fn(
    (
      _doc: unknown,
      _page: unknown,
      run: TextRun,
      _s: unknown,
      text: string,
    ) => {
      run.text = text;
      return true;
    },
  ),
}));
vi.mock("@editor/tools/pdfTextEditor/commands/scanTextEdit", () => ({
  isScanRun: (run: { renderMode?: number }) => run.renderMode === 3,
  captureScanEdit: () => ({}) as ScanEditState,
  renderScanEdit,
}));

function fixture() {
  const page = new Page({ index: 0, pagePtr: 1, width: 600, height: 800 });
  const run = new TextRun({
    id: "ocr",
    pageIndex: 0,
    pdfiumObjPtr: 11,
    text: "Jane",
    bounds: { x: 100, y: 690, width: 40, height: 10 },
    matrix: { a: 1, b: 0, c: 0, d: 1, e: 100, f: 690 },
    fontId: "Helvetica",
    fontSize: 12,
    fontSubset: false,
    fill: { r: 0, g: 0, b: 0, a: 255 },
    renderMode: 3,
  });
  page.setRuns([run]);
  const flushGenerate = vi.fn();
  page.flushGenerate = flushGenerate;
  const doc = { module: {}, page: () => page } as unknown as EditorDocument;
  return { doc, run, flushGenerate };
}

beforeEach(() => {
  vi.useFakeTimers();
  renderScanEdit.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("undoing typing in scanned text", () => {
  it("redraws the block once for a whole burst, each way", () => {
    const { doc, run } = fixture();
    const history = new HistoryStack();
    for (const nextText of ["Jan", "Ja", "Jo", "Joe"])
      history.execute(
        new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
        doc,
      );
    renderScanEdit.mockClear();

    history.undo(doc);
    expect(renderScanEdit.mock.calls.map((c) => c[4])).toEqual(["Jane"]);
    expect(run.text).toBe("Jane");

    renderScanEdit.mockClear();
    history.redo(doc);
    expect(renderScanEdit.mock.calls.map((c) => c[4])).toEqual(["Joe"]);
    expect(run.text).toBe("Joe");
  });

  it("redoes a burst to its last drawn text when its last step was refused", () => {
    const { doc, run } = fixture();
    renderScanEdit.mockImplementation((_d, _p, r, _s, text) => {
      if (/\p{Script=Hebrew}/u.test(text)) return false;
      r.text = text;
      return true;
    });
    const history = new HistoryStack();
    for (const nextText of ["Janet", "Janetש"])
      history.execute(
        new EditTextCommand({ pageIndex: 0, runId: run.id, nextText }),
        doc,
      );
    expect(run.text).toBe("Janet");

    history.undo(doc);
    expect(run.text).toBe("Jane");
    history.redo(doc);
    expect(run.text).toBe("Janet");
  });
});

describe("wrapping scanned text", () => {
  it("leaves the block alone, since its words are pixels in the scan", () => {
    const { doc, run, flushGenerate } = fixture();
    new ReflowWrapCommand({
      pageIndex: 0,
      runId: run.id,
      maxWidthPt: 10,
      explicit: true,
    }).apply(doc);
    expect(flushGenerate).not.toHaveBeenCalled();
    expect(run.text).toBe("Jane");
  });
});
