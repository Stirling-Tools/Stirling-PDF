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

async function openFixture(page: import("@playwright/test").Page) {
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
}

// `[data-testid^="pdf-editor-image-"]` also matches the hidden file input.
const IMAGE = '[data-testid^="pdf-editor-image-p"]';
const PNG = path.join(import.meta.dirname, "../test-fixtures/sample.png");

test.describe("PDF text editor - tagged documents", () => {
  test("edited text stays in the structure tree", async ({ page }) => {
    test.setTimeout(120_000);
    await openFixture(page);

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

  test("an image's description is edited in the inspector and saved", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFixture(page);

    await page.locator(IMAGE).first().click();
    const field = page.getByTestId("pdf-editor-image-description");
    await expect(field).toHaveValue("Bar chart of revenue by region");

    await field.fill("Revenue by region, third quarter");
    await saveAndReopen(page);

    await page.locator(IMAGE).first().click();
    await expect(page.getByTestId("pdf-editor-image-description")).toHaveValue(
      "Revenue by region, third quarter",
    );
  });

  test("an image without a description is flagged and reached from the document summary", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFixture(page);
    const image = page.locator(IMAGE).first();
    const imageId = (await image.getAttribute("data-testid"))!.replace(
      "pdf-editor-image-",
      "",
    );
    const badge = page.getByTestId(`pdf-editor-image-attention-${imageId}`);
    const summary = page.getByTestId(
      "pdf-editor-document-accessibility-summary",
    );
    await expect(badge).toBeHidden();

    await image.click();
    await page.getByTestId("pdf-editor-image-description").fill("");
    await expect(badge).toBeVisible();

    // Next shows the description of the image it picks, even with one selected.
    await page.getByTestId("pdf-editor-tab-document").click();
    await page.getByTestId("pdf-editor-document-accessibility-next").click();
    await expect(
      page.getByTestId("pdf-editor-image-description"),
    ).toBeVisible();

    // Escape from the Document tab clears the selection and leaves the tab open.
    await page.getByTestId("pdf-editor-tab-document").click();
    await page.keyboard.press("Escape");
    await expect(summary).toHaveText(
      /Missing descriptions\s*1\s*Untagged images\s*0/,
    );

    await page.getByTestId("pdf-editor-document-accessibility-next").click();
    const field = page.getByTestId("pdf-editor-image-description");
    await expect(field).toHaveValue("");
    await field.fill("Revenue by region");
    await expect(badge).toBeHidden();

    await page.getByTestId("pdf-editor-tab-document").click();
    await expect(summary).toHaveText(
      /Missing descriptions\s*0\s*Untagged images\s*0/,
    );
    await expect(
      page.getByTestId("pdf-editor-document-accessibility-next"),
    ).toBeHidden();
  });

  test("an image inserted into a tagged document is flagged, then tagged by describing it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFixture(page);
    const images = page.locator(IMAGE);
    await expect(images).toHaveCount(1);

    await page
      .locator('[data-testid="pdf-editor-image-input"]')
      .setInputFiles(PNG);
    await expect(images).toHaveCount(2);
    const untagged = page.locator(
      '[data-testid^="pdf-editor-image-attention-"][data-attention="untagged"]',
    );
    await expect(untagged).toHaveCount(1);

    await page.getByTestId("pdf-editor-tab-document").click();
    await page.keyboard.press("Escape");
    const summary = page.getByTestId(
      "pdf-editor-document-accessibility-summary",
    );
    await expect(summary).toHaveText(
      /Missing descriptions\s*0\s*Untagged images\s*1/,
    );

    await images.nth(1).click();
    await page.getByTestId("pdf-editor-image-description").fill("A red square");
    await expect(untagged).toHaveCount(0);
    await saveAndReopen(page);

    await page.locator(IMAGE).nth(1).click();
    await expect(page.getByTestId("pdf-editor-image-description")).toHaveValue(
      "A red square",
    );
  });

  test("an image marked decorative saves as decoration, and can be described again", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFixture(page);

    await page.locator(IMAGE).first().click();
    const decorative = page.getByTestId("pdf-editor-image-decorative");
    await expect(decorative).not.toBeChecked();
    // The styled box hides its input, so the click goes to the label.
    await page
      .getByTestId("pdf-editor-image-accessibility")
      .getByText("Decorative image", { exact: true })
      .click();
    await expect(decorative).toBeChecked();
    await expect(page.getByTestId("pdf-editor-image-description")).toBeHidden();
    await saveAndReopen(page);

    await page.locator(IMAGE).first().click();
    await expect(decorative).toBeChecked();
    await expect(page.getByTestId("pdf-editor-image-description")).toBeHidden();

    await page
      .getByTestId("pdf-editor-image-accessibility")
      .getByText("Decorative image", { exact: true })
      .click();
    await expect(decorative).not.toBeChecked();
    const field = page.getByTestId("pdf-editor-image-description");
    await expect(field).toHaveValue("");
    await field.fill("Revenue by region");
    await saveAndReopen(page);

    await page.locator(IMAGE).first().click();
    await expect(page.getByTestId("pdf-editor-image-description")).toHaveValue(
      "Revenue by region",
    );
  });
});
