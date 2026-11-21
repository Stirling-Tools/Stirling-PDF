// @vitest-environment node
import { afterEach, expect, test } from "vitest";
import { SetParagraphFormatCommand } from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import {
  captureFormats,
  shiftFormats,
  undoneShift,
} from "@editor/tools/pdfTextEditor/util/carriedFormats";
import { applyDocumentChange } from "@editor/tools/pdfTextEditor/util/documentChanges";
import { exportToBlob } from "@editor/tools/pdfTextEditor/util/exportPdf";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();
const reopened: EditorStore[] = [];
afterEach(() => {
  for (const store of reopened.splice(0)) store.dispose();
});

test("alignment and underline survive a page change, keeping one rule per line", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const page = store.document!.page(0);
  const para = page.runs.find((r) => r.text.startsWith("First line"))!;
  store.dispatch(
    new SetParagraphFormatCommand({
      pageIndex: 0,
      runIds: [para.id],
      align: "center",
      underline: true,
    }),
  );
  const rules = page.underlines.get(para.id)!.length;
  const formats = captureFormats(store.document!);
  const saved = new Uint8Array(
    await (await exportToBlob(store.document!)).arrayBuffer(),
  );
  const changed = await applyDocumentChange(saved, {
    kind: "duplicatePage",
    page: 0,
  });

  const next = new EditorStore();
  reopened.push(next);
  next.carryFormatsInto(
    next.currentLoadToken,
    shiftFormats(formats, changed.pageShift ?? null),
  );
  const doc = await EditorDocument.open(changed.bytes);
  await next.setDocument(doc);
  const first = doc.page(0);
  PdfiumTextReader.populate(doc, first);
  const lines = first.runs.filter((r) => first.paragraphFormats.has(r.id));
  expect(lines.length).toBeGreaterThan(0);
  for (const line of lines)
    expect([line.align, line.underline]).toEqual(["center", true]);
  const ptrs = lines.flatMap((line) => first.underlines.get(line.id) ?? []);
  expect(ptrs).toHaveLength(rules);
  expect(first.shapes.some((s) => ptrs.includes(s.pdfiumObjPtr))).toBe(false);

  const objects = () => doc.module.FPDFPage_CountObjects(first.pagePtr);
  const before = objects();
  next.dispatch(
    new SetParagraphFormatCommand({
      pageIndex: 0,
      runIds: lines.map((line) => line.id),
      underline: false,
    }),
  );
  expect(objects()).toBe(before - rules);
});

test("formats follow their pages across an added or deleted page, and back on undo", () => {
  const formats = new Map([
    [0, []],
    [2, []],
  ]);
  const added = shiftFormats(formats, { inserted: 1 });
  expect([...added.keys()]).toEqual([0, 3]);
  expect([...shiftFormats(added, undoneShift({ inserted: 1 })).keys()]).toEqual(
    [0, 2],
  );
  expect([...shiftFormats(formats, { deleted: 0 }).keys()]).toEqual([1]);
});
