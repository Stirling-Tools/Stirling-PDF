import { test, expect } from "@editor/tests/helpers/stub-test-base";
import path from "path";

// Editing text in a tagged PDF must keep it in the structure tree. The editor
// re-creates the objects it edits, and an object created without the original's
// marked-content ID is text assistive technology can no longer reach, while the
// element that described it points at nothing.

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/tagged-sample.pdf",
);

interface TagAudit {
  untaggedText: number;
  contentMcids: number[];
  treeMcids: number[];
}

// Reads the open document through the editor's own PDFium; after a reopen that
// is exactly what was saved.
const AUDIT = (): TagAudit => {
  type Fn = (...args: number[]) => number;
  const doc = (
    window as unknown as {
      __editor_store: {
        document: {
          module: Record<string, Fn>;
          page: (i: number) => { pagePtr: number };
        };
      };
    }
  ).__editor_store.document;
  const m = doc.module;
  const pagePtr = doc.page(0).pagePtr;

  let untaggedText = 0;
  const content = new Set<number>();
  for (let i = 0; i < m.FPDFPage_CountObjects(pagePtr); i++) {
    const obj = m.FPDFPage_GetObject(pagePtr, i);
    if (m.FPDFPageObj_GetType(obj) === 1 && m.FPDFPageObj_CountMarks(obj) === 0)
      untaggedText++;
    const id = m.FPDFPageObj_GetMarkedContentID(obj);
    if (id >= 0) content.add(id);
  }

  const tree = new Set<number>();
  const walk = (el: number) => {
    for (let i = 0; i < m.FPDF_StructElement_GetMarkedContentIdCount(el); i++) {
      const id = m.FPDF_StructElement_GetMarkedContentIdAtIndex(el, i);
      if (id >= 0) tree.add(id);
    }
    for (let i = 0; i < m.FPDF_StructElement_CountChildren(el); i++) {
      const kid = m.FPDF_StructElement_GetChildAtIndex(el, i);
      if (kid) walk(kid);
    }
  };
  const root = m.FPDF_StructTree_GetForPage(pagePtr);
  for (let i = 0; i < m.FPDF_StructTree_CountChildren(root); i++)
    walk(m.FPDF_StructTree_GetChildAtIndex(root, i));
  m.FPDF_StructTree_Close(root);

  const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
  return {
    untaggedText,
    contentMcids: sorted(content),
    treeMcids: sorted(tree),
  };
};

const RUN_ID = (needle: string) => {
  const runs = (
    window as unknown as {
      __editor_store: {
        state: { pages: { runs: { id: string; text: string }[] }[] };
      };
    }
  ).__editor_store.state.pages[0].runs;
  return runs.find((r) => r.text.includes(needle))?.id ?? null;
};

async function typeInto(
  page: import("@playwright/test").Page,
  runId: string,
  text: string,
  mode: "append" | "replace",
) {
  await page.evaluate(
    ({ id, text, mode }) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-run-${id}"]`,
      );
      if (!el) throw new Error("run missing");
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      if (mode === "append") range.collapse(false);
      const sel = window.getSelection();
      if (!sel) throw new Error("no selection api");
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    },
    { id: runId, text, mode },
  );
  await expect.poll(() => page.evaluate(RUN_ID, text)).not.toBeNull();
}

async function saveAndReopen(page: import("@playwright/test").Page) {
  const downloaded = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("pdf-editor-download").click();
  const confirm = page.getByTestId("pdf-editor-save-risk-confirm");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const saved = test.info().outputPath("tagged-structure.pdf");
  await (await downloaded).saveAs(saved);
  await page.evaluate(() => {
    const w = window as unknown as {
      __editor_store?: { document: unknown };
      __prev_document?: unknown;
    };
    w.__prev_document = w.__editor_store?.document;
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(saved);
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __editor_store?: {
          document: unknown;
          state: { pages: { runs: unknown[] }[] };
        };
        __prev_document?: unknown;
      };
      const s = w.__editor_store;
      if (!s?.document || s.document === w.__prev_document) return false;
      return (s.state.pages[0]?.runs.length ?? 0) > 0;
    },
    undefined,
    { timeout: 30_000 },
  );
}

test.describe("PDF text editor - tagged documents", () => {
  test("edited text stays in the structure tree", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
      timeout: 15_000,
    });
    await page
      .locator('[data-testid="pdf-editor-file-input"]')
      .setInputFiles(FIXTURE);
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(() => page.evaluate(RUN_ID, "product line"), { timeout: 30_000 })
      .not.toBeNull();

    expect(await page.evaluate(AUDIT)).toEqual({
      untaggedText: 0,
      contentMcids: [0, 1, 2],
      treeMcids: [0, 1, 2],
    });

    const heading = await page.evaluate(RUN_ID, "Quarterly report");
    const paragraph = await page.evaluate(RUN_ID, "product line");
    expect(heading, "heading run").not.toBeNull();
    expect(paragraph, "paragraph run").not.toBeNull();

    // A whole-text replace re-emits the run; an append edits it in place.
    await typeInto(page, heading!, "Annual summary", "replace");
    await typeInto(page, paragraph!, " Up 4%.", "append");
    await saveAndReopen(page);

    await expect
      .poll(() => page.evaluate(RUN_ID, "Annual summary"))
      .not.toBeNull();
    await expect.poll(() => page.evaluate(RUN_ID, "Up 4%.")).not.toBeNull();
    // The save gives each repeated sequence of an edited run its own MCID, so
    // the count depends on how many objects the edit emitted. What must hold
    // is that the originals survive and content and tree still agree.
    const saved = await page.evaluate(AUDIT);
    expect(saved.untaggedText).toBe(0);
    expect(saved.contentMcids).toEqual(saved.treeMcids);
    expect(saved.contentMcids).toEqual(expect.arrayContaining([0, 1, 2]));
  });
});
