// @vitest-environment node
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { EditTextCommand } from "@editor/tools/pdfTextEditor/commands/EditTextCommand";
import { EditorDocument } from "@editor/tools/pdfTextEditor/model/EditorDocument";
import { PdfiumTextReader } from "@editor/tools/pdfTextEditor/pdfium/PdfiumTextReader";
import { HistoryStack } from "@editor/tools/pdfTextEditor/store/HistoryStack";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../tests/test-fixtures/paragraph-sample.pdf",
);
const HEADING = "Heading in a bigger size";

const opened: EditorDocument[] = [];

beforeAll(async () => {
  const wasm = await readFile(
    createRequire(import.meta.url).resolve("@embedpdf/pdfium/pdfium.wasm"),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith(".wasm")
        ? new Response(wasm, {
            headers: { "Content-Type": "application/wasm" },
          })
        : new Response(null, { status: 404 }),
    ),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const doc of opened.splice(0)) doc.dispose();
});

afterAll(() => vi.unstubAllGlobals());

// Objects taken off the page and neither put back nor freed.
function trackDetached(doc: EditorDocument): Set<number> {
  const m = doc.module;
  const detached = new Set<number>();
  const remove = m.FPDFPage_RemoveObject.bind(m);
  const insert = m.FPDFPage_InsertObject.bind(m);
  const destroy = m.FPDFPageObj_Destroy.bind(m);
  vi.spyOn(m, "FPDFPage_RemoveObject").mockImplementation((page, ptr) => {
    const removed = remove(page, ptr);
    if (removed) detached.add(ptr);
    return removed;
  });
  vi.spyOn(m, "FPDFPage_InsertObject").mockImplementation((page, ptr) => {
    detached.delete(ptr);
    return insert(page, ptr);
  });
  vi.spyOn(m, "FPDFPageObj_Destroy").mockImplementation((ptr) => {
    detached.delete(ptr);
    return destroy(ptr);
  });
  return detached;
}

test("undoing and redoing a burst that is replayed whole does not pile up objects", async () => {
  vi.spyOn(
    EditTextCommand.prototype as unknown as { revertsExactly(): boolean },
    "revertsExactly",
  ).mockReturnValue(false);
  const doc = await EditorDocument.open(new Uint8Array(await readFile(SAMPLE)));
  opened.push(doc);
  PdfiumTextReader.populate(doc, doc.page(0));
  const heading = doc.page(0).runs.find((r) => r.text === HEADING)!;
  const history = new HistoryStack();
  for (const nextText of [`Xk ${HEADING}`, `Xk ${HEADING} Zq7`])
    history.execute(
      new EditTextCommand({ pageIndex: 0, runId: heading.id, nextText }),
      doc,
    );
  const detached = trackDetached(doc);
  history.undo(doc);
  history.redo(doc);
  const afterOneCycle = detached.size;

  for (let i = 0; i < 20; i++) {
    history.undo(doc);
    history.redo(doc);
  }

  expect(detached.size).toBeLessThanOrEqual(afterOneCycle + 2);
  expect(heading.text).toBe(`Xk ${HEADING} Zq7`);
  history.undo(doc);
  expect(heading.text).toBe(HEADING);
});
