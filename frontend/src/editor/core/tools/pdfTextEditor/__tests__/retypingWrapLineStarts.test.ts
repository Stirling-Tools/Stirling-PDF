// @vitest-environment node
import { expect, test } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { ReflowWrapCommand } from "@editor/tools/pdfTextEditor/commands/ReflowWrapCommand";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";

servePdfiumWasm();
const { fixture } = editorStores();

async function shortenedFirstLine(pullUp: boolean) {
  const store = await fixture("paragraph-sample.pdf");
  const doc = store.document!;
  const body = doc
    .page(0)
    .runs.find((r) => r.text.startsWith("First line of the body"))!;
  const lines = body.text.split("\n");
  lines[0] = "First";
  const history = new HistoryStack();
  history.execute(
    new EditTextCommand({
      pageIndex: 0,
      runId: body.id,
      nextText: lines.join("\n"),
    }),
    doc,
  );
  history.execute(
    new ReflowWrapCommand({
      pageIndex: 0,
      runId: body.id,
      maxWidthPt: body.bounds.width - 20,
      pullUp,
    }),
    doc,
  );
  return body.text.split("\n");
}

test("a wrap that retypes the lines keeps a word that starts a line on its line", async () => {
  const lines = await shortenedFirstLine(false);
  expect(lines[0]).toBe("First");
  expect(lines[1].startsWith("Second line")).toBe(true);
});

test("a retyping wrap with pullUp still rejoins a line start that fits above", async () => {
  const lines = await shortenedFirstLine(true);
  expect(lines[0].startsWith("First Second")).toBe(true);
});
