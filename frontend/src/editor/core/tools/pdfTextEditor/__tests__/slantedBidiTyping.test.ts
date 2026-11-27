// @vitest-environment node
import { expect, test } from "vitest";
import {
  editorStores,
  servePdfiumWasm,
} from "@editor/tools/pdfTextEditor/__tests__/editorStores";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { SetObliqueCommand } from "@editor/tools/pdfTextEditor/commands/SetObliqueCommand";

servePdfiumWasm();
const { fixture } = editorStores();

async function typedOrigins(oblique: boolean): Promise<string[]> {
  const store = await fixture("rtl-sample.pdf");
  const doc = store.document!;
  const page = doc.page(0);
  const run = page.runs.find((r) => r.text.startsWith("Mixed"))!;
  if (oblique)
    store.dispatch(
      new SetObliqueCommand({ pageIndex: 0, runId: run.id, oblique: true }),
    );
  const base = run.text;
  const typed = " slanted";
  for (let n = 1; n <= typed.length; n++)
    store.dispatch(
      new EditTextCommand({
        pageIndex: 0,
        runId: run.id,
        nextText: base + typed.slice(0, n),
      }),
    );
  const m = doc.module;
  const textPage = m.FPDFText_LoadPage(page.pagePtr);
  const xy = m.pdfium.wasmExports.malloc(16);
  const origins: string[] = [];
  try {
    for (let i = 0; i < m.FPDFText_CountChars(textPage); i++) {
      m.FPDFText_GetCharOrigin(textPage, i, xy, xy + 8);
      origins.push(
        `${String.fromCodePoint(m.FPDFText_GetUnicode(textPage, i))}${m.pdfium.getValue(xy, "double").toFixed(1)}`,
      );
    }
  } finally {
    m.FPDFText_ClosePage(textPage);
    m.pdfium.wasmExports.free(xy);
  }
  return origins.slice(-"slanted".length);
}

test("letters typed one at a time onto a slanted line with right-to-left text sit where upright ones do", async () => {
  expect(await typedOrigins(true)).toEqual(await typedOrigins(false));
});
