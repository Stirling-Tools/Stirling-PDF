// @vitest-environment node
import { ignoresTextStroke } from "@editor/tools/pdfTextEditor/charcode/fontGlyphs";
import { ensurePageRead } from "@editor/tools/pdfTextEditor/hooks/useDocumentLoader";
import { expect, test } from "vitest";
import { SetColourCommand } from "@editor/tools/pdfTextEditor/commands/SetColourCommand";
import { SetFontSizeCommand } from "@editor/tools/pdfTextEditor/commands/SetFontSizeCommand";
import { SetTextOutlineCommand } from "@editor/tools/pdfTextEditor/commands/SetTextOutlineCommand";
import {
  fauxBoldWidth,
  isFauxBold,
} from "@editor/tools/pdfTextEditor/util/fauxBold";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

async function fauxBoldRun() {
  const store = await fixture("subset-font-sample.pdf");
  const run = store.document!.page(0).runs[0];
  store.dispatch(
    new SetTextOutlineCommand({
      pageIndex: 0,
      runId: run.id,
      stroke: { ...run.fill, a: 255 },
      width: fauxBoldWidth(run.fontSize),
    }),
  );
  expect(isFauxBold(run)).toBe(true);
  return { store, run };
}

test("a drawn bold takes on the text's new colour, and undo puts both back", async () => {
  const { store, run } = await fauxBoldRun();
  const before = { ...run.fill };
  store.dispatch(
    new SetColourCommand({
      pageIndex: 0,
      runId: run.id,
      nextFill: { r: 200, g: 20, b: 20, a: 255 },
    }),
  );
  expect(run.stroke).toMatchObject({ r: 200, g: 20, b: 20 });
  expect(isFauxBold(run)).toBe(true);
  store.undo();
  expect(run.fill).toEqual(before);
  expect(isFauxBold(run)).toBe(true);
});

test("a drawn bold keeps its weight when the text is resized", async () => {
  const { store, run } = await fauxBoldRun();
  store.dispatch(
    new SetFontSizeCommand({ pageIndex: 0, runId: run.id, nextSize: 24 }),
  );
  expect(run.strokeWidth).toBeCloseTo(fauxBoldWidth(24));
  expect(isFauxBold(run)).toBe(true);
  store.undo();
  expect(isFauxBold(run)).toBe(true);
});

test("Type 3 text is not drawn bold, since its glyphs ignore the outline", async () => {
  const store = await fixture("stirling-marketing.pdf");
  ensurePageRead(store, 1);
  const type3 = store.document!.page(1).runs[0];
  expect(ignoresTextStroke(type3.fontId)).toBe(true);
  const { run } = await fauxBoldRun();
  expect(ignoresTextStroke(run.fontId)).toBe(false);
});
