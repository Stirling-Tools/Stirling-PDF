// @vitest-environment node
import { expect, test } from "vitest";
import { InsertTextCommand } from "@editor/tools/pdfTextEditor/commands/InsertTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { SetParagraphFormatCommand } from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import { resizeRunCommand } from "@editor/tools/pdfTextEditor/commands/resizeRun";
import {
  collectMemberPtrs,
  measureObjBoundsPt,
} from "@editor/tools/pdfTextEditor/commands/editTextHelpers";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

async function rightAlignedBox(text: string, width: number) {
  const store = await fixture("paragraph-sample.pdf");
  const doc = store.document!;
  const insert = new InsertTextCommand({ pageIndex: 0, x: 40, y: 60, text });
  store.dispatch(insert);
  const runId = insert.insertedRunId!;
  const run = doc.page(0).findRun(runId)!;
  store.dispatch(
    new ReflowWrapCommand({
      pageIndex: 0,
      runId,
      maxWidthPt: width,
      explicit: true,
    }),
  );
  store.dispatch(
    new SetParagraphFormatCommand({
      pageIndex: 0,
      runIds: [runId],
      align: "right",
    }),
  );
  const ink = () => measureObjBoundsPt(doc.module, collectMemberPtrs(run))!;
  return { store, doc, run, ink };
}

test.each([
  ["one line", "Short words"],
  ["a wrapped paragraph", "Short words that wrap over a few lines in the box"],
])(
  "widening a right-aligned box moves %s to the new right edge",
  async (_, text) => {
    const { store, doc, run, ink } = await rightAlignedBox(text, 150);
    const left = run.alignFrame!.left;
    expect(ink().right).toBeCloseTo(left + 150, 0);
    const before = ink();

    store.dispatch(resizeRunCommand(doc, 0, run.id, 250)!);
    expect(run.wrapWidthPt).toBe(250);
    expect(ink().right).toBeCloseTo(left + 250, 0);
    expect(ink().left).toBeGreaterThanOrEqual(left - 0.5);
    const after = ink();

    store.history.undo(doc);
    expect(ink().left).toBeCloseTo(before.left, 1);
    expect(ink().right).toBeCloseTo(before.right, 1);
    expect(run.alignFrame!.right).toBeCloseTo(left + 150, 3);

    store.history.redo(doc);
    expect(ink().left).toBeCloseTo(after.left, 1);
    expect(ink().right).toBeCloseTo(after.right, 1);
  },
);

test("a box that was never aligned keeps its lines where they are when widened", async () => {
  const store = await fixture("paragraph-sample.pdf");
  const doc = store.document!;
  const insert = new InsertTextCommand({
    pageIndex: 0,
    x: 40,
    y: 60,
    text: "Short words",
  });
  store.dispatch(insert);
  const run = doc.page(0).findRun(insert.insertedRunId!)!;
  const ink = () => measureObjBoundsPt(doc.module, collectMemberPtrs(run))!;
  const before = ink();
  const cmd = resizeRunCommand(doc, 0, run.id, 250);
  if (cmd) store.dispatch(cmd);
  expect(run.alignFrame).toBeNull();
  expect(ink().left).toBeCloseTo(before.left, 1);
});
