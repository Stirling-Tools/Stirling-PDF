// @vitest-environment node
import { expect, test } from "vitest";
import { SetParagraphFormatCommand } from "@editor/tools/pdfTextEditor/commands/paragraphFormat";
import { pageChangeCommand } from "@editor/tools/pdfTextEditor/util/documentChanges";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

test("alignment and underline stay on their paragraph through a page change and its undo", async () => {
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
  const rules = page.underlines.get(para.id)!.length;

  store.dispatch(
    pageChangeCommand(doc, { kind: "duplicatePage", page: 0 }).command,
  );
  expect(store.document).toBe(doc);
  expect(page.findRun(para.id)).toMatchObject({
    align: "center",
    underline: true,
  });
  expect(page.underlines.get(para.id)).toHaveLength(rules);

  store.undo();
  store.undo();
  expect(page.findRun(para.id)?.align).toBeNull();
  expect(page.underlines.has(para.id)).toBe(false);
});
