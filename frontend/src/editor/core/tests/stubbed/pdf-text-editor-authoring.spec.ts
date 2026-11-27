import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import {
  openFormatMenu,
  openInTextEditor,
} from "@editor/tests/helpers/pdf-text-editor";
import path from "path";

const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
const EMPTY_SIGNATURE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/signature-empty-field.pdf",
);
const FORM_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/form-fields-sample.pdf",
);

interface AuthoringRun {
  id: string;
  text: string;
  fontSize: number;
  fontId: string;
  bounds: { x: number; width: number };
  paragraphLineSlots: Array<{ baselineY: number }>;
}

interface AuthoringWindow {
  __editor_store: {
    doc: {
      page(index: number): {
        width: number;
        runs: AuthoringRun[];
        underlines: Map<string, number[]>;
      };
    };
    selection: { selectOne(runId: string): void };
  };
}

function runOnPage(page: Page, match: string) {
  return page.evaluate((source) => {
    const store = (window as unknown as AuthoringWindow).__editor_store;
    const p = store.doc.page(0);
    const run = p.runs.find((r) => new RegExp(source).test(r.text));
    if (!run) throw new Error(`no run matching ${source}`);
    return {
      id: run.id,
      text: run.text,
      fontSize: run.fontSize,
      fontId: run.fontId,
      left: run.bounds.x,
      right: run.bounds.x + run.bounds.width,
      pageWidth: p.width,
      baselines: run.paragraphLineSlots.map((s) => s.baselineY),
      underlines: p.underlines.get(run.id)?.length ?? 0,
    };
  }, match);
}

async function selectRun(page: Page, runId: string) {
  await page.evaluate((id) => {
    (window as unknown as AuthoringWindow).__editor_store.selection.selectOne(
      id,
    );
  }, runId);
  await expect(page.getByTestId("pdf-editor-underline")).toBeVisible();
}

async function paragraphChoice(page: Page, testId: string) {
  await openFormatMenu(page, "paragraph");
  const choice = page.getByTestId(testId);
  await choice.click();
  await choice.press("Escape");
  await expect(choice).toHaveCount(0);
}

async function clickPageCorner(page: Page) {
  const area = page.getByTestId("pdf-editor-page-0");
  const box = (await area.boundingBox())!;
  await area.click({ position: { x: box.width - 3, y: box.height - 3 } });
}

async function blurPage(page: Page) {
  await page
    .getByTestId("pdf-editor-page-0")
    .click({ position: { x: 500, y: 420 } });
}

async function addTextAt(page: Page, x: number, y: number) {
  const fresh = page.locator('[data-testid^="pdf-editor-run-p0-new-"]');
  const before = await fresh.count();
  await page.getByTestId("pdf-editor-add-text").click();
  await page.getByTestId("pdf-editor-page-0").click({ position: { x, y } });
  await expect(fresh).toHaveCount(before + 1, { timeout: 10_000 });
  return fresh.last();
}

test.describe("PDF text editor: writing a new document", () => {
  test("a new text box takes typing straight over its placeholder", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const box = await addTextAt(page, 120, 300);

    await expect(box).toBeFocused();
    await page.keyboard.type("Dear Sam");
    await expect(box).toHaveText("Dear Sam");
  });

  test("dragging out a text box sets its width, and typing wraps inside it", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const fresh = page.locator('[data-testid^="pdf-editor-run-p0-new-"]');
    await page.getByTestId("pdf-editor-add-text").click();
    const area = (await page.getByTestId("pdf-editor-page-0").boundingBox())!;
    const scale = await page.evaluate(() => {
      const store = (window as unknown as AuthoringWindow).__editor_store;
      return store.doc.page(0).width;
    });
    const cssPerPt = area.width / scale;
    await page.mouse.move(area.x + 100, area.y + 300);
    await page.mouse.down();
    await page.mouse.move(area.x + 220, area.y + 305, { steps: 4 });
    await expect(page.getByTestId("pdf-editor-text-box-draft")).toBeVisible();
    await page.mouse.move(area.x + 300, area.y + 310, { steps: 4 });
    await page.mouse.up();
    await expect(fresh).toHaveCount(1, { timeout: 10_000 });
    await expect(fresh).toBeFocused();

    await page.keyboard.type(
      "A box drawn to a set width keeps every line of this sentence inside it",
    );
    await blurPage(page);
    const run = await runOnPage(page, "^A box drawn");
    expect(run.baselines.length).toBeGreaterThan(1);
    expect(run.left).toBeCloseTo(100 / cssPerPt, 0);
    expect(run.right - run.left).toBeLessThanOrEqual(200 / cssPerPt + 1);
  });

  test("clicking a placeholder selects all of it, and typed text is edited in place", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const box = await addTextAt(page, 120, 300);
    await page
      .getByTestId("pdf-editor-page-0")
      .click({ position: { x: 500, y: 420 } });
    await expect(box).not.toBeFocused();

    await box.click();
    await page.keyboard.type("Invoice");
    await expect(box).toHaveText("Invoice");

    await page
      .getByTestId("pdf-editor-page-0")
      .click({ position: { x: 500, y: 420 } });
    const size = await box.boundingBox();
    await box.click({ position: { x: (size?.width ?? 40) - 1, y: 4 } });
    await page.keyboard.type(" 42");
    await expect(box).toHaveText("Invoice 42");
  });
});

test.describe("PDF text editor: paragraph formatting", () => {
  test("centring a title keeps it centred on the page as it is retyped, and undo puts it back", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const box = await addTextAt(page, 120, 300);
    await page.keyboard.type("Report title");
    await blurPage(page);
    const before = await runOnPage(page, "^Report title$");

    await selectRun(page, before.id);
    await paragraphChoice(page, "pdf-editor-text-align-center");
    await expect
      .poll(async () => {
        const run = await runOnPage(page, "^Report title$");
        return Math.abs((run.left + run.right) / 2 - run.pageWidth / 2);
      })
      .toBeLessThan(1.5);

    const size = await box.boundingBox();
    await box.click({ position: { x: (size?.width ?? 40) - 1, y: 4 } });
    await page.keyboard.type(" for 2026");
    await blurPage(page);
    await expect
      .poll(async () => {
        const run = await runOnPage(page, "^Report title for 2026$");
        return Math.abs((run.left + run.right) / 2 - run.pageWidth / 2);
      })
      .toBeLessThan(1.5);

    await page.getByTestId("pdf-editor-undo").click();
    await page.getByTestId("pdf-editor-undo").click();
    await expect
      .poll(async () => (await runOnPage(page, "^Report title$")).left)
      .toBeCloseTo(before.left, 0);
  });

  test("a centred title can still be dragged to a new place", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const box = await addTextAt(page, 120, 300);
    await page.keyboard.type("Moving title");
    await blurPage(page);
    const run = await runOnPage(page, "^Moving title$");
    await selectRun(page, run.id);
    await paragraphChoice(page, "pdf-editor-text-align-center");
    await expect
      .poll(async () => {
        const r = await runOnPage(page, "^Moving title$");
        return Math.abs((r.left + r.right) / 2 - r.pageWidth / 2);
      })
      .toBeLessThan(1.5);
    const centred = await runOnPage(page, "^Moving title$");

    const at = await box.boundingBox();
    if (!at) throw new Error("no title box");
    await page.keyboard.down("Control");
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
    await page.mouse.down();
    await page.mouse.move(at.x + at.width / 2 + 90, at.y + at.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await page.keyboard.up("Control");

    await expect
      .poll(
        async () =>
          (await runOnPage(page, "^Moving title$")).left - centred.left,
      )
      .toBeGreaterThan(40);
  });

  test("Ctrl+U and Ctrl+Shift+E format the box being typed in", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const box = await addTextAt(page, 120, 300);
    await page.keyboard.type("Shortcut title");
    await page.keyboard.press("ControlOrMeta+u");
    await page.keyboard.press("ControlOrMeta+Shift+E");
    await expect
      .poll(async () => {
        const run = await runOnPage(page, "^Shortcut title$");
        return [
          run.underlines,
          Math.abs((run.left + run.right) / 2 - run.pageWidth / 2) < 1.5,
        ];
      })
      .toEqual([1, true]);
    await expect(box.locator("u")).toHaveCount(0);
  });

  test("Enter continues a bulleted list, and Enter on an empty bullet ends it", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await addTextAt(page, 120, 250);
    await page.keyboard.type("Apples");
    await page.keyboard.press("ControlOrMeta+Shift+Digit8");
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("• Apples");

    const box = page
      .locator('[data-testid^="pdf-editor-run-p0-new-"]')
      .filter({ hasText: "Apples" });
    const at = await box.boundingBox();
    if (!at) throw new Error("no list box");
    await box.click({ position: { x: at.width - 1, y: at.height / 2 } });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Pears", { delay: 30 });
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("• Apples\n• Pears");

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Done", { delay: 30 });
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("• Apples\n• Pears\nDone");
  });

  test("Enter after ending a list adds a plain blank line, not a bullet", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await addTextAt(page, 120, 250);
    await page.keyboard.type("Apples");
    await page.keyboard.press("ControlOrMeta+Shift+Digit8");
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("• Apples");
    const box = page
      .locator('[data-testid^="pdf-editor-run-p0-new-"]')
      .filter({ hasText: "Apples" });
    const at = await box.boundingBox();
    if (!at) throw new Error("no list box");
    await box.click({ position: { x: at.width - 1, y: at.height / 2 } });
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("• Apples\n");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Done", { delay: 30 });
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("• Apples\n\nDone");
  });

  test("Enter inside a numbered list renumbers the items after it", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await addTextAt(page, 120, 250);
    await page.keyboard.type("Apples");
    await page.keyboard.press("ControlOrMeta+Shift+Digit7");
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("1. Apples");

    const box = page
      .locator('[data-testid^="pdf-editor-run-p0-new-"]')
      .filter({ hasText: "Apples" });
    let at = await box.boundingBox();
    if (!at) throw new Error("no list box");
    await box.click({ position: { x: at.width - 1, y: at.height / 2 } });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Pears", { delay: 30 });
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("1. Apples\n2. Pears");

    at = await box.boundingBox();
    if (!at) throw new Error("no list box");
    await box.click({ position: { x: at.width - 1, y: at.height / 4 } });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Kiwis", { delay: 30 });
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("1. Apples\n2. Kiwis\n3. Pears");
  });

  test("Enter after the wrapped line of a bulleted item starts the next bullet", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const para = await runOnPage(page, "^First line");
    await selectRun(page, para.id);
    await paragraphChoice(page, "pdf-editor-list-bullet");
    await expect
      .poll(async () => (await runOnPage(page, "First line")).text)
      .toMatch(/^• First line/);
    const bulleted = (await runOnPage(page, "First line")).text;
    const wrappedEnd = "block.";

    const box = page.locator(`[data-run-id="${para.id}"]`);
    await box.click();
    await box.evaluate((el, end) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.replace(/\u00A0/g, " ").indexOf(end) ?? -1;
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at + end.length);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        return;
      }
      throw new Error("wrapped line not found");
    }, wrappedEnd);
    await page.keyboard.press("Enter");
    await page.keyboard.type("Third", { delay: 30 });
    await expect
      .poll(async () => (await runOnPage(page, "First line")).text)
      .toBe(bulleted.replace(wrappedEnd, `${wrappedEnd}\n• Third`));
  });

  test("Enter inside a bulleted item makes the rest of it the next bullet", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await addTextAt(page, 120, 250);
    await page.keyboard.type("Apples");
    await page.keyboard.press("ControlOrMeta+Shift+Digit8");
    await expect
      .poll(async () => (await runOnPage(page, "Apples")).text)
      .toBe("• Apples");

    const box = page
      .locator('[data-testid^="pdf-editor-run-p0-new-"]')
      .filter({ hasText: "Apples" });
    await box.click();
    await box.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent?.indexOf("les") ?? -1;
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
        return;
      }
      throw new Error("item text not found");
    });
    await page.keyboard.press("Enter");
    await page.keyboard.type("Pick", { delay: 30 });
    await expect
      .poll(async () => (await runOnPage(page, "App")).text)
      .toBe("• App\n• Pickles");
  });

  test("underline draws a rule under every line of a paragraph and toggles off", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const para = await runOnPage(page, "^First line");
    await selectRun(page, para.id);

    await page.getByTestId("pdf-editor-underline").click();
    await expect
      .poll(async () => (await runOnPage(page, "^First line")).underlines)
      .toBe(para.baselines.length);
    await expect(page.getByTestId("pdf-editor-underline")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("pdf-editor-underline").click();
    await expect
      .poll(async () => (await runOnPage(page, "^First line")).underlines)
      .toBe(0);
  });

  test("lists mark the paragraph with a bullet or a number, and the same choice again removes it", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const para = await runOnPage(page, "^First line");
    await selectRun(page, para.id);

    await paragraphChoice(page, "pdf-editor-list-bullet");
    await expect
      .poll(async () => (await runOnPage(page, "First line")).text)
      .toMatch(/^• First line/);

    await paragraphChoice(page, "pdf-editor-list-number");
    await expect
      .poll(async () => (await runOnPage(page, "First line")).text)
      .toMatch(/^1\. First line/);

    await paragraphChoice(page, "pdf-editor-list-number");
    await expect
      .poll(async () => (await runOnPage(page, "First line")).text)
      .toMatch(/^First line/);
  });

  test("double line spacing sets the paragraph's baselines two single lines apart", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const para = await runOnPage(page, "^First line");
    await selectRun(page, para.id);

    await paragraphChoice(page, "pdf-editor-line-spacing-2");
    await expect
      .poll(async () => {
        const run = await runOnPage(page, "^First line");
        return run.baselines[0] - run.baselines[1];
      })
      .toBeCloseTo(para.fontSize * 1.2 * 2, 0);
  });

  test("a text style sets size and weight together, in one undo step", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const para = await runOnPage(page, "^First line");
    await selectRun(page, para.id);

    await page.getByTestId("pdf-editor-text-style").click();
    await page.getByTestId("pdf-editor-text-style-heading1").click();
    await expect
      .poll(async () => {
        const run = await runOnPage(page, "^First line");
        return [run.fontSize, /bold/i.test(run.fontId)];
      })
      .toEqual([18, true]);

    await page.getByTestId("pdf-editor-undo").click();
    await expect
      .poll(async () => {
        const run = await runOnPage(page, "^First line");
        return [run.fontSize, /bold/i.test(run.fontId)];
      })
      .toEqual([para.fontSize, false]);
  });
});

const SMALL_PAGE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/type3-sample.pdf",
);
const SCANNED_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/scanned-ocr-tesseract.pdf",
);

test.describe("PDF text editor: new text on any page", () => {
  test("a title too wide for a small page wraps inside it", async ({
    page,
  }) => {
    await openInTextEditor(page, SMALL_PAGE_PDF);
    const box = await addTextAt(page, 40, 40);
    await page.keyboard.type("A heading long enough to need two lines");
    await clickPageCorner(page);
    const typed = await runOnPage(page, "^A heading");
    await selectRun(page, typed.id);

    await page.getByTestId("pdf-editor-text-style").click();
    await page.getByTestId("pdf-editor-text-style-title").click();
    await expect
      .poll(
        async () =>
          (await runOnPage(page, "^A heading")).text.split("\n").length,
      )
      .toBeGreaterThan(1);
    const title = await runOnPage(page, "^A heading");
    expect(title.right).toBeLessThanOrEqual(title.pageWidth + 0.5);
    await expect(box).toBeVisible();
  });

  test("text can be added over a picture, such as a scanned page", async ({
    page,
  }) => {
    await openInTextEditor(page, SCANNED_PDF);
    await addTextAt(page, 60, 60);
    await page.keyboard.type("Approved");
    await clickPageCorner(page);
    await expect
      .poll(async () => (await runOnPage(page, "^Approved$")).text)
      .toBe("Approved");
  });
});

interface DocWindow {
  __editor_store: {
    doc: {
      displayOrder(): number[];
      page(index: number): {
        width: number;
        height: number;
        annotations: Array<{
          kind: string;
          rect: { x: number; y: number; width: number; height: number };
        }>;
      };
    } | null;
    history: { mark: number };
  };
}

function docShape(page: Page) {
  return page.evaluate(() => {
    const doc = (window as unknown as DocWindow).__editor_store.doc;
    if (!doc) return null;
    const first = doc.page(doc.displayOrder()[0]);
    return {
      pages: doc.displayOrder().length,
      width: Math.round(first.width),
      height: Math.round(first.height),
      widgets: first.annotations.filter((a) => a.kind === "widget").length,
    };
  });
}

async function pageAction(page: Page, testId: string) {
  await page.getByTestId("pdf-editor-pages").click();
  await page.getByTestId(testId).click();
}

test.describe("PDF text editor: pages and form fields", () => {
  test("the viewer's fill-and-save bar stays out of the way while the editor is open", async ({
    page,
  }) => {
    await openInTextEditor(page, FORM_PDF);
    await expect(page.locator("[data-run-id]").first()).toBeVisible();
    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBeGreaterThan(1);
    await expect(
      page.getByText("This PDF contains fillable fields"),
    ).toHaveCount(0);
  });

  test("pages can be added, duplicated and deleted from the editor", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await expect.poll(async () => (await docShape(page))?.pages).toBe(1);

    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await expect(page.getByTestId("pdf-editor-page-1")).toBeVisible({
      timeout: 30_000,
    });

    await pageAction(page, "pdf-editor-page-duplicate");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(3);

    await pageAction(page, "pdf-editor-page-delete");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
  });

  test("page setup opens on the size and orientation of the page in view", async ({
    page,
  }) => {
    await openInTextEditor(page, MANY_PAGES_PDF);
    await pageAction(page, "pdf-editor-page-setup");
    const dialog = page.getByTestId("pdf-editor-page-setup-panel");
    await expect(dialog.locator('input[value="portrait"]')).toBeChecked();
    await expect(dialog.locator('input[value="LETTER"]')).toBeChecked();
    await dialog.getByText("Landscape", { exact: true }).click();
    await dialog.getByText("This page", { exact: true }).click();
    await page.getByTestId("pdf-editor-page-setup-apply").click();
    await expect
      .poll(async () => (await pageSizes(page))[0], { timeout: 30_000 })
      .toEqual([792, 612]);

    await pageAction(page, "pdf-editor-page-setup");
    await expect(dialog.locator('input[value="landscape"]')).toBeChecked();
  });

  test("a right-click on bare page changes that page, not the one in view", async ({
    page,
  }) => {
    await openInTextEditor(page, MANY_PAGES_PDF);
    const before = (await docShape(page))!.pages;
    const firstPage = page.getByTestId("pdf-editor-page-0");
    await firstPage.click({ button: "right", position: { x: 4, y: 4 } });
    await expect(page.getByTestId("pdf-editor-context-menu")).toBeVisible();
    await page.getByTestId("pdf-editor-page-duplicate").click();
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(before + 1);

    await firstPage.click({ button: "right", position: { x: 4, y: 4 } });
    await page.getByTestId("pdf-editor-page-setup").click();
    const setup = page.getByTestId("pdf-editor-page-setup-panel");
    await expect(setup.locator('input[value="portrait"]')).toBeChecked();
    await setup.getByText("Landscape", { exact: true }).click();
    await page.getByTestId("pdf-editor-page-setup-apply").click();
    await expect(setup).toHaveCount(0);
    await expect
      .poll(async () => (await pageSizes(page))[0], { timeout: 30_000 })
      .toEqual([792, 612]);
    expect((await pageSizes(page))[1]).toEqual([612, 792]);
  });

  test("Undo takes back a page change after the edits made since", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await addTextAt(page, 120, 380);
    await page.keyboard.type("After the page");
    await blurPage(page);

    const undo = page.getByTestId("pdf-editor-undo");
    const edits = await page.evaluate(
      () => (window as unknown as DocWindow).__editor_store.history.mark,
    );
    for (let i = 1; i < edits; i++) await undo.click();
    expect(await pageTexts(page, 0)).not.toContain("After the page");
    expect((await docShape(page))?.pages).toBe(2);
    await expect(undo).toBeEnabled();
    await undo.click();
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(1);
  });

  test("Redo makes an undone page change again", async ({ page }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await page.getByTestId("pdf-editor-undo").click();
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(1);
    await expect(page.getByTestId("pdf-editor-redo")).toBeEnabled();
    await page.getByTestId("pdf-editor-redo").click();
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
  });

  test("underline and alignment stay on a paragraph through a page change", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const para = await runOnPage(page, "^First line");
    await selectRun(page, para.id);
    await page.getByTestId("pdf-editor-underline").click();
    await paragraphChoice(page, "pdf-editor-text-align-center");
    const formats = () =>
      page.evaluate(() => {
        const store = (
          window as unknown as {
            __editor_store: {
              doc: {
                page(index: number): {
                  runs: Array<{
                    id: string;
                    text: string;
                    align: string | null;
                  }>;
                  underlines: Map<string, number[]>;
                };
              };
            };
          }
        ).__editor_store;
        const first = store.doc.page(0);
        const lines = first.runs.filter((r) => first.underlines.has(r.id));
        return {
          rules: lines.reduce(
            (n, r) => n + (first.underlines.get(r.id)?.length ?? 0),
            0,
          ),
          aligned: lines.every((r) => r.align === "center"),
          paragraphs: lines.length,
        };
      });
    await expect
      .poll(formats)
      .toEqual({ rules: para.baselines.length, aligned: true, paragraphs: 1 });

    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await expect
      .poll(formats, { timeout: 15_000 })
      .toEqual({ rules: para.baselines.length, aligned: true, paragraphs: 1 });
  });

  test("Undo puts the page back to the size it was before page setup", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    const before = (await pageSizes(page))[0];
    await pageAction(page, "pdf-editor-page-setup");
    const dialog = page.getByTestId("pdf-editor-page-setup-panel");
    await dialog.getByText("A3", { exact: true }).click();
    await dialog.getByText("Portrait", { exact: true }).click();
    await page.getByTestId("pdf-editor-page-setup-apply").click();
    await expect
      .poll(async () => (await pageSizes(page))[0], { timeout: 30_000 })
      .toEqual([842, 1191]);

    const undo = page.getByTestId("pdf-editor-undo");
    await expect(undo).toBeEnabled({ timeout: 30_000 });
    await undo.click();
    await expect
      .poll(async () => (await pageSizes(page))[0], { timeout: 30_000 })
      .toEqual(before);
  });

  test("page setup turns every page to landscape Letter", async ({ page }) => {
    await openInTextEditor(page, MANY_PAGES_PDF);
    const count = (await pageSizes(page)).length;
    expect(count).toBeGreaterThan(1);
    await pageAction(page, "pdf-editor-page-setup");
    const dialog = page.getByTestId("pdf-editor-page-setup-panel");
    await dialog.getByText("Letter", { exact: true }).click();
    await dialog.getByText("Landscape", { exact: true }).click();
    await dialog.getByText("All pages", { exact: true }).click();
    await page.getByTestId("pdf-editor-page-setup-apply").click();
    await expect
      .poll(async () => pageSizes(page), { timeout: 30_000 })
      .toEqual(Array.from({ length: count }, () => [792, 612]));
  });

  test("an unsigned signature field does not stop later page changes", async ({
    page,
  }) => {
    await openInTextEditor(page, EMPTY_SIGNATURE_PDF);
    const pages = (await docShape(page))!.pages;
    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(pages + 1);
  });
});

function pageTexts(page: Page, index: number) {
  return page.evaluate((i) => {
    const store = (window as unknown as AuthoringWindow).__editor_store;
    return store.doc.page(i).runs.map((r) => r.text);
  }, index);
}

test.describe("PDF text editor: text that reaches the bottom of the page", () => {
  test("flows onto the blank page after it, and typing carries on there", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await page.getByTestId("pdf-editor-page-0").scrollIntoViewIfNeeded();

    await addTextAt(page, 60, 380);
    await page.keyboard.type("Line one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Line two", { delay: 40 });

    await expect
      .poll(async () => (await pageTexts(page, 1)).join("|"), {
        timeout: 15_000,
      })
      .toBe("Line two");
    await expect
      .poll(async () =>
        (await pageTexts(page, 0)).some((t) => t === "Line one"),
      )
      .toBe(true);
  });

  test("typing carries straight on once a line has flowed onto a new page", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await page.evaluate(() => {
      (
        window as unknown as { __editor_store: { doc: { __opened?: boolean } } }
      ).__editor_store.doc.__opened = true;
    });
    await addTextAt(page, 60, 380);
    await page.keyboard.type("Line one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Line two");
    await page.keyboard.type(" more");

    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await expect
      .poll(async () => (await pageTexts(page, 1)).join("|"), {
        timeout: 15_000,
      })
      .toBe("Line two more");
    expect(
      await page.evaluate(
        () =>
          (
            window as unknown as {
              __editor_store: { doc: { __opened?: boolean } };
            }
          ).__editor_store.doc.__opened,
      ),
    ).toBe(true);
  });

  test("adds a page for the text as soon as it runs off the page", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await addTextAt(page, 60, 380);
    await page.keyboard.type("Line one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Line two", { delay: 40 });

    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await expect
      .poll(async () => (await pageTexts(page, 1)).join("|"), {
        timeout: 15_000,
      })
      .toBe("Line two");
  });

  test("a title that grows past the bottom carries on onto a new page", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await addTextAt(page, 60, 370);
    await page.keyboard.type("A closing heading long enough to need lines");
    await blurPage(page);
    const typed = await runOnPage(page, "^A closing");
    await selectRun(page, typed.id);

    await page.getByTestId("pdf-editor-text-style").click();
    await page.getByTestId("pdf-editor-text-style-title").click();
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await expect
      .poll(async () => (await pageTexts(page, 1)).join(" "), {
        timeout: 15_000,
      })
      .not.toBe("");
  });
});

const MANY_PAGES_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/many-pages-sample.pdf",
);

function pageSizes(page: Page) {
  return page.evaluate(() => {
    const doc = (window as unknown as DocWindow).__editor_store.doc;
    if (!doc) return [];
    return doc.displayOrder().map((i) => {
      const p = doc.page(i);
      return [Math.round(p.width), Math.round(p.height)];
    });
  });
}

test.describe("PDF text editor: page actions on a longer document", () => {
  test("acts on the page in view and changes only that page's size when asked", async ({
    page,
  }) => {
    await openInTextEditor(page, MANY_PAGES_PDF);
    const sizes = await pageSizes(page);
    expect(sizes.length).toBeGreaterThan(2);

    await page.getByTestId("pdf-editor-page-2").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("pdf-editor-page-2")).toBeInViewport({
      ratio: 0.5,
    });
    await pageAction(page, "pdf-editor-page-setup");
    const dialog = page.getByTestId("pdf-editor-page-setup-panel");
    await dialog.getByText("Landscape", { exact: true }).click();
    await dialog.getByText("This page", { exact: true }).click();
    await page.getByTestId("pdf-editor-page-setup-apply").click();

    await expect
      .poll(async () => (await pageSizes(page))[2], { timeout: 30_000 })
      .toEqual([792, 612]);
    const after = await pageSizes(page);
    expect(after.filter((_size, i) => i !== 2)).toEqual(
      sizes.filter((_size, i) => i !== 2),
    );
  });
});

test.describe("PDF text editor: saving a written document", () => {
  test("a page and new text both survive Save without an error", async ({
    page,
  }) => {
    await openInTextEditor(page, PARAGRAPH_PDF);
    await pageAction(page, "pdf-editor-page-add");
    await expect
      .poll(async () => (await docShape(page))?.pages, { timeout: 30_000 })
      .toBe(2);
    await addTextAt(page, 120, 380);
    await page.keyboard.type("Signed off");
    await blurPage(page);
    await page.getByTestId("pdf-editor-save").click();
    await expect(page.getByTestId("pdf-editor-save")).toBeDisabled({
      timeout: 30_000,
    });

    const after = await page.evaluate(() => {
      const store = (
        window as unknown as DocWindow & {
          __editor_store: { getState(): { error: string | null } };
        }
      ).__editor_store;
      const doc = store.doc!;
      return {
        error: store.getState().error,
        pages: doc.displayOrder().length,
        widgets: doc.page(0).annotations.filter((a) => a.kind === "widget")
          .length,
      };
    });
    expect(after).toMatchObject({ error: null, pages: 2 });

    const savedCopy = () =>
      page.evaluate(async () => {
        const store = (
          window as unknown as {
            __editor_store: { source: { fileId: string | null } };
          }
        ).__editor_store;
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("stirling-pdf-files");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          const record = await new Promise<
            { data: Blob | ArrayBuffer } | undefined
          >((resolve, reject) => {
            const request = db
              .transaction("files")
              .objectStore("files")
              .get(store.source.fileId!);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (!record) return null;
          const bytes =
            record.data instanceof Blob
              ? await record.data.arrayBuffer()
              : record.data;
          return Array.from(new Uint8Array(bytes));
        } finally {
          db.close();
        }
      });
    await expect
      .poll(async () => (await savedCopy())?.length ?? 0)
      .toBeGreaterThan(0);
    const saved = await savedCopy();
    await openInTextEditor(page, {
      name: "saved-copy.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(saved!),
    });
    await expect
      .poll(async () => docShape(page), { timeout: 30_000 })
      .toMatchObject({ pages: 2 });
    await expect
      .poll(async () => pageTexts(page, 0), { timeout: 30_000 })
      .toContain("Signed off");
  });
});
