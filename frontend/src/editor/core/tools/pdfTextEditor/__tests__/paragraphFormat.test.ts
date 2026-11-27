// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import { SetParagraphFormatCommand } from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import {
  collectMemberPtrs,
  measureObjBoundsPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { softStartsOf } from "@editor/tools/pdfTextEditor/pdfium/lineBreaks";
import {
  listIndentFor,
  toggledListText,
} from "@editor/tools/pdfTextEditor/util/listText";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { MoveTextRunCommand } from "@editor/tools/pdfTextEditor/commands/MoveTextRunCommand";
import { DeleteObjectCommand } from "@editor/tools/pdfTextEditor/commands/DeleteObjectCommand";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import { SetFontFamilyCommand } from "@editor/tools/pdfTextEditor/commands/SetFontFamilyCommand";
import { SetLineSpacingCommand } from "@editor/tools/pdfTextEditor/commands/SetLineSpacingCommand";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { lineWidthIn } from "@editor/tools/pdfTextEditor/util/wrapText";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture, storeWith } = editorStores();

afterEach(() => vi.restoreAllMocks());

describe("paragraph format sync", () => {
  test("aligns text drawn inside a form XObject, lifting it onto the page so the move saves", async () => {
    const store = await fixture("form-xobject-sample.pdf");
    const page = store.document!.page(0);
    const run = page.runs.find((r) => r.containerPtr !== 0 && r.text.trim())!;
    const { text } = run;
    const leftBefore = run.bounds.x;

    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [run.id],
        align: "right",
      }),
    );
    expect(run.containerPtr).toBe(0);
    expect(run.bounds.x).toBeGreaterThan(leftBefore + 1);

    const saved = await exportToBlob(store.document!);
    const reopened = await storeWith(new Uint8Array(await saved.arrayBuffer()));
    const again = reopened.document!.page(0).runs.find((r) => r.text === text);
    expect(again?.bounds.x).toBeCloseTo(run.bounds.x, 0);
  });

  test("centres a line on the page and undoes in one step", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const insert = new InsertTextCommand({
      pageIndex: 0,
      x: 40,
      y: 60,
      text: "Title",
    });
    store.dispatch(insert);
    const runId = insert.insertedRunId!;
    const page = store.document!.page(0);
    const run = page.findRun(runId)!;
    const leftBefore = run.bounds.x;

    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [runId],
        align: "center",
      }),
    );
    const centre = () => {
      const ink = measureObjBoundsPt(store.document!.module, [
        run.pdfiumObjPtr,
      ])!;
      return (ink.left + ink.right) / 2;
    };
    expect(centre()).toBeCloseTo(page.width / 2, 0);

    store.undo();
    expect(run.bounds.x).toBeCloseTo(leftBefore, 1);
    expect(run.align).toBeNull();
  });

  test("underlines a list item from its text, clear of the marker", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const doc = store.document!;
    const page = doc.page(0);
    const para = page.runs.find((r) => r.text.startsWith("First line"))!;
    const nextText = toggledListText(para.text, softStartsOf(para), "bullet");
    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: para.id,
        nextText,
        explicit: true,
      }),
    );
    const indent = listIndentFor(nextText, lineWidthIn(doc, page, para));
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        listIndent: indent,
        underline: true,
      }),
    );

    const [first] = page.underlines.get(para.id)!;
    const rule = measureObjBoundsPt(doc.module, [first])!;
    const line = measureObjBoundsPt(
      doc.module,
      para.paragraphLineSlots[0].mergedFromPtrs,
    )!;
    expect(rule.left).toBeCloseTo(line.left + indent, 0);
  });

  test("recolouring underlined text recolours its underline", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const doc = store.document!;
    const page = doc.page(0);
    const para = page.runs.find((r) => r.text.startsWith("First line"))!;
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        underline: true,
      }),
    );
    store.dispatch(
      new SetColourCommand({
        pageIndex: 0,
        runId: para.id,
        nextFill: { r: 200, g: 0, b: 0, a: 255 },
      }),
    );
    const [rule] = page.underlines.get(para.id)!;
    const red = doc.module.pdfium.wasmExports.malloc(16);
    try {
      doc.module.FPDFPageObj_GetFillColor(
        rule,
        red,
        red + 4,
        red + 8,
        red + 12,
      );
      expect(doc.module.pdfium.getValue(red, "i32")).toBe(200);
    } finally {
      doc.module.pdfium.wasmExports.free(red);
    }
  });

  test("underlines every line and removes the rules when turned off", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const page = store.document!.page(0);
    const para = page.runs.find((r) => r.text.startsWith("First line"))!;
    const objects = () =>
      store.document!.module.FPDFPage_CountObjects(page.pagePtr);
    const before = objects();

    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        underline: true,
      }),
    );
    expect(page.underlines.get(para.id)).toHaveLength(
      para.paragraphLineSlots.length,
    );
    expect(objects()).toBe(before + para.paragraphLineSlots.length);

    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        underline: false,
      }),
    );
    expect(page.underlines.has(para.id)).toBe(false);
    expect(objects()).toBe(before);
  });

  test("sets a list item's wrapped lines in past its marker", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const doc = store.document!;
    const page = doc.page(0);
    const para = page.runs.find((r) => r.text.startsWith("First line"))!;
    const soft = softStartsOf(para);
    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: para.id,
        nextText: toggledListText(para.text, soft, "bullet"),
        explicit: true,
      }),
    );
    const indent = listIndentFor(para.text, lineWidthIn(doc, page, para));
    expect(indent).toBeGreaterThan(para.fontSize * 0.4);
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        listIndent: indent,
      }),
    );
    const lefts = para.paragraphLineSlots.map(
      (slot) => measureObjBoundsPt(doc.module, slot.mergedFromPtrs)!.left,
    );
    const lines = softStartsOf(para);
    lefts.forEach((left, i) => {
      const glyphInset = i === 0 || !lines[i] ? 0 : indent;
      if (i > 0) expect(left - lefts[0]).toBeCloseTo(glyphInset, 0);
    });
    expect(lines.some((isSoft, i) => i > 0 && isSoft)).toBe(true);

    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: para.id,
        nextText: toggledListText(para.text, softStartsOf(para), "bullet"),
        explicit: true,
      }),
    );
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        listIndent: 0,
      }),
    );
    const flush = para.paragraphLineSlots.map(
      (slot) => measureObjBoundsPt(doc.module, slot.mergedFromPtrs)!.left,
    );
    flush.forEach((left) => expect(left).toBeCloseTo(flush[0], 0));
  });

  test("an underline follows its run when it moves and goes when the run is deleted", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const doc = store.document!;
    const page = doc.page(0);
    const para = page.runs.find((r) => r.text.startsWith("First line"))!;
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        underline: true,
      }),
    );
    const ruleBox = () =>
      measureObjBoundsPt(doc.module, page.underlines.get(para.id) ?? [])!;
    const before = ruleBox();

    store.dispatch(
      new MoveTextRunCommand({ pageIndex: 0, runId: para.id, dx: 30, dy: -20 }),
    );
    const moved = ruleBox();
    expect(moved.left - before.left).toBeCloseTo(30, 0);
    expect(moved.bottom - before.bottom).toBeCloseTo(-20, 0);

    const objects = () => doc.module.FPDFPage_CountObjects(page.pagePtr);
    const withRules = objects();
    store.dispatch(new DeleteObjectCommand({ pageIndex: 0, runId: para.id }));
    expect(page.underlines.has(para.id)).toBe(false);
    expect(objects()).toBeLessThan(
      withRules - para.paragraphLineSlots.length + 1,
    );

    store.undo();
    expect(page.underlines.get(para.id)).toHaveLength(
      para.paragraphLineSlots.length,
    );
  });

  test("line spacing re-lines the paragraph and undoes in one step", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const page = store.document!.page(0);
    const para = page.runs.find((r) => r.text.startsWith("First line"))!;
    const gap = () =>
      para.paragraphLineSlots[0].baselineY -
      para.paragraphLineSlots[1].baselineY;
    const before = gap();
    store.dispatch(
      new SetLineSpacingCommand({ pageIndex: 0, runId: para.id, factor: 2 }),
    );
    expect(gap()).toBeCloseTo(para.fontSize * 1.2 * 2, 0);
    store.undo();
    expect(gap()).toBeCloseTo(before, 1);
  });

  test("an aligned or list-indented run can be dragged anywhere and keeps its layout there", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const doc = store.document!;
    const page = doc.page(0);
    const insert = new InsertTextCommand({
      pageIndex: 0,
      x: 40,
      y: 60,
      text: "Title",
    });
    store.dispatch(insert);
    const run = page.findRun(insert.insertedRunId!)!;
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [run.id],
        align: "center",
      }),
    );
    const ink = () => measureObjBoundsPt(doc.module, [run.pdfiumObjPtr])!;
    const centred = ink().left;

    store.dispatch(
      new MoveTextRunCommand({ pageIndex: 0, runId: run.id, dx: 70, dy: 10 }),
    );
    expect(ink().left - centred).toBeCloseTo(70, 0);

    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: "Title two",
      }),
    );
    const after = ink();
    expect((after.left + after.right) / 2).toBeCloseTo(page.width / 2 + 70, 0);

    store.undo();
    store.undo();
    expect(ink().left).toBeCloseTo(centred, 0);
  });

  test("a regroup keeps the underline drawn and tracked by the regrouped lines", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const doc = store.document!;
    const page = doc.page(0);
    const para = page.runs.find((r) => r.text.startsWith("First line"))!;
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [para.id],
        underline: true,
      }),
    );
    const m = doc.module;
    const paths = () => {
      let count = 0;
      for (let i = 0; i < m.FPDFPage_CountObjects(page.pagePtr); i++)
        if (m.FPDFPageObj_GetType(m.FPDFPage_GetObject(page.pagePtr, i)) === 2)
          count++;
      return count;
    };
    const withRules = paths();

    const rules = page.underlines.get(para.id)!.length;
    store.setGroupingMode("line");
    const tracked = [...page.underlines.values()].flat();
    expect(tracked).toHaveLength(rules);
    expect(paths()).toBe(withRules);

    const first = page.runs[0];
    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: first.id,
        nextText: `${first.text}!`,
      }),
    );
    expect(paths()).toBe(withRules);
    expect(store.canUndo).toBe(true);
  });

  test("a centred title typed into keeps its centre through undo and redo of the typing", async () => {
    const store = await fixture("paragraph-sample.pdf");
    const doc = store.document!;
    const page = doc.page(0);
    const insert = new InsertTextCommand({
      pageIndex: 0,
      x: 80,
      y: 100,
      text: "New text",
      placeholder: true,
    });
    store.dispatch(insert);
    const run = page.findRun(insert.insertedRunId!)!;
    const left = () =>
      measureObjBoundsPt(doc.module, collectMemberPtrs(run))!.left;
    let text = "";
    for (const ch of "Report title") {
      text += ch;
      store.dispatch(
        new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: text }),
      );
    }
    const typed = left();
    store.dispatch(
      new SetParagraphFormatCommand({
        pageIndex: 0,
        runIds: [run.id],
        align: "center",
      }),
    );
    const centred = left();
    for (const ch of " for 2026") {
      text += ch;
      store.dispatch(
        new EditTextCommand({ pageIndex: 0, runId: run.id, nextText: text }),
      );
    }
    const longer = left();

    store.undo();
    expect(run.text).toBe("Report title");
    expect(left()).toBeCloseTo(centred, 0);
    store.redo();
    expect(run.text).toBe("Report title for 2026");
    expect(left()).toBeCloseTo(longer, 0);
    store.undo();
    store.undo();
    expect(left()).toBeCloseTo(typed, 0);
  });

  test.each([false, true])(
    "a typing burst in a centred, underlined paragraph undoes and redoes whole (replayed whole: %s)",
    async (replayedWhole) => {
      if (replayedWhole)
        vi.spyOn(
          EditTextCommand.prototype as unknown as { revertsExactly(): boolean },
          "revertsExactly",
        ).mockReturnValue(false);
      await burstInFormattedParagraph();
    },
  );
});

async function burstInFormattedParagraph() {
  const store = await fixture("paragraph-sample.pdf");
  const doc = store.document!;
  const page = doc.page(0);
  const para = page.runs.find((r) => r.text.startsWith("First line"))!;
  store.dispatch(
    new SetParagraphFormatCommand({
      pageIndex: 0,
      runIds: [para.id],
      align: "center",
      underline: true,
    }),
  );
  const original = para.text;
  const centres = () =>
    para.paragraphLineSlots.map((slot) => {
      const ink = measureObjBoundsPt(doc.module, slot.mergedFromPtrs)!;
      return Math.round((ink.left + ink.right) / 2);
    });
  const centredBefore = centres();
  const rules = () => page.underlines.get(para.id)?.length ?? 0;

  let text = original;
  for (const word of [" more", " words", " here", "\nA new line"]) {
    text += word;
    store.dispatch(
      new EditTextCommand({ pageIndex: 0, runId: para.id, nextText: text }),
    );
  }
  const typed = para.text;
  const centredAfter = centres();
  const paraCentre = Math.round(
    (Math.min(
      ...para.paragraphLineSlots.map(
        (s) => measureObjBoundsPt(doc.module, s.mergedFromPtrs)!.left,
      ),
    ) +
      Math.max(
        ...para.paragraphLineSlots.map(
          (s) => measureObjBoundsPt(doc.module, s.mergedFromPtrs)!.right,
        ),
      )) /
      2,
  );
  centredAfter.forEach((c) =>
    expect(Math.abs(c - paraCentre)).toBeLessThanOrEqual(1),
  );
  expect(rules()).toBe(para.paragraphLineSlots.length);

  store.undo();
  expect(para.text).toBe(original);
  expect(centres()).toEqual(centredBefore);
  expect(rules()).toBe(para.paragraphLineSlots.length);

  store.redo();
  expect(para.text).toBe(typed);
  expect(centres()).toEqual(centredAfter);
  expect(rules()).toBe(para.paragraphLineSlots.length);

  store.undo();
  expect(para.text).toBe(original);
  expect(centres()).toEqual(centredBefore);
  expect(rules()).toBe(para.paragraphLineSlots.length);
}

test("line spacing keeps every line's first word at the start of its line", async () => {
  const store = await fixture("two-column-sample.pdf");
  const page = store.document!.page(1);
  PdfiumTextReader.populate(store.document!, page);
  const para = page.runs.find((r) => r.text.startsWith("Name:"))!;
  const lineStarts = () =>
    para.text.split("\n").map((line) => line.split(/\s+/)[0]);
  store.dispatch(
    new SetFontFamilyCommand({
      pageIndex: 1,
      runId: para.id,
      nextFamily: "Helvetica-BoldOblique",
    }),
  );
  store.dispatch(
    new SetFontSizeCommand({ pageIndex: 1, runId: para.id, nextSize: 16 }),
  );
  store.dispatch(
    new SetParagraphFormatCommand({
      pageIndex: 1,
      runIds: [para.id],
      align: "center",
    }),
  );
  const before = lineStarts();
  store.dispatch(
    new SetLineSpacingCommand({ pageIndex: 1, runId: para.id, factor: 1.5 }),
  );
  expect(lineStarts()).toEqual(before);
});
