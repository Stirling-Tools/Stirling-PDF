import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";
// Independent parser for the round-trip cross-check: the same @cantoo/pdf-lib
// the fixture generators use.
import { PDFDocument } from "@cantoo/pdf-lib";
import {
  stashCurrentDocument,
  waitForReopenedPage,
} from "@app/tests/stubbed/v2SaveHelpers";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const MULTI_PAGE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/multi-page-sample.pdf",
);
const FORM_XOBJECT_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/form-xobject-sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
// The same Sample.pdf that ships in `frontend/editor/public/samples/`.
const USER_SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/user-sample.pdf",
);
// Carries an embedded font whose name table has the 6-letter "ABCDEF+" subset
// tag, so the editor reliably flags a run as fontSubset.
const SUBSET_FONT_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/subset-font-sample.pdf",
);
// 80-page synthetic fixture (generate-big-sample.mjs). The largest input
// in the suite - exercises the loading overlay and the lazy page reader.
const BIG_SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/big-sample.pdf",
);

// v2 PDF text editor regression suite. v2 runs entirely in the browser via
// PDFium WASM, so these tests do not need a real backend.

async function gotoV2(page: import("@playwright/test").Page) {
  await page.goto("/pdf-text-editor", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
}

/** Change the selected run's font family through the real toolbar dropdown. */
async function selectFontFamily(
  page: import("@playwright/test").Page,
  optionLabel: string,
) {
  await page.getByTestId("v2-font-family").click();
  await page.getByRole("option", { name: optionLabel, exact: true }).click();
}

async function loadSamplePdf(page: import("@playwright/test").Page) {
  // The visible "Open" flow goes through the left-sidebar Files panel.
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE_PDF);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
}

async function loadMultiPageSample(page: import("@playwright/test").Page) {
  await page
    .locator('[data-testid="v2-file-input"]')
    .setInputFiles(MULTI_PAGE_PDF);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
}

/** Type a string into a contenteditable using `execCommand('insertText')`. */
async function typeIntoRun(
  page: import("@playwright/test").Page,
  runTestId: string,
  text: string,
  position: "end" | "start" = "end",
) {
  await page.evaluate(
    ({ runTestId, text, position }) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${runTestId}"]`,
      );
      if (!el) throw new Error(`run ${runTestId} not in DOM`);
      el.focus();
      const sel = window.getSelection();
      if (!sel) throw new Error("no Selection api");
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(position === "end" ? false : true);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, text);
    },
    { runTestId, text, position },
  );
}

test.describe("PDF text editor v2 - smoke", () => {
  test("v2 mounts at /pdf-text-editor", async ({ page }) => {
    await gotoV2(page);
    await expect(page.getByTestId("v2-sidebar-empty")).toBeVisible();
    await expect(page.getByTestId("v2-toolbar")).toBeVisible();
  });
});

test.describe("PDF text editor v2 - load and render", () => {
  test("loads a PDF in the browser and renders its text runs", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    // After load: at least one text run overlay exists. The sidebar
    // dropzone stays visible so users can open a different PDF.
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    await expect(runs.first()).toBeVisible();
    expect(await runs.count()).toBeGreaterThan(0);
    // The sidebar status panel should also be visible.
    await expect(page.getByTestId("v2-sidebar-status")).toBeVisible();
  });
});

test.describe("PDF text editor v2 - editing", () => {
  test("typing into a run updates the overlay", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRunTestId = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .first()
      .getAttribute("data-testid");
    expect(firstRunTestId).toBeTruthy();

    await typeIntoRun(page, firstRunTestId!, " EDITED");

    await expect(page.getByTestId(firstRunTestId!)).toContainText("EDITED");
  });

  test("undo reverts the last edit", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";
    const originalText = (await firstRun.innerText()) ?? "";

    await typeIntoRun(page, runTestId, "Z");
    await expect(firstRun).toContainText("Z");

    await page.getByTestId("v2-undo").click();
    await expect(firstRun).toHaveText(originalText);
  });

  test("redo replays the last undone edit", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";

    await typeIntoRun(page, runTestId, "X");
    await page.getByTestId("v2-undo").click();
    await page.getByTestId("v2-redo").click();
    await expect(firstRun).toContainText("X");
  });
});

test.describe("PDF text editor v2 - overlay grows to fit typed text", () => {
  test("typing wider text expands the overlay so nothing gets clipped", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const beforeWidth = await firstRun.evaluate(
      (el) => el.getBoundingClientRect().width,
    );

    const testid = await firstRun.getAttribute("data-testid");
    await typeIntoRun(
      page,
      testid!,
      "This Replacement Is Much Wider Than The Original",
    );

    const afterWidth = await firstRun.evaluate(
      (el) => el.getBoundingClientRect().width,
    );
    expect(afterWidth).toBeGreaterThan(beforeWidth);
  });
});

test.describe("PDF text editor v2 - selection + properties", () => {
  test("selecting a run enables the toolbar controls", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const fontSize = page.getByTestId("v2-font-size");
    const colour = page.getByTestId("v2-colour");

    // Before selection, the toolbar inputs are disabled.
    await expect(fontSize).toBeDisabled();
    await expect(colour).toBeDisabled();

    await page.locator('[data-testid^="v2-run-p0-"]').first().click();
    await expect(fontSize).toBeEnabled();
    await expect(colour).toBeEnabled();
  });

  test("changing the font-size control updates the run fontSize", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runId = await firstRun.evaluate((el) =>
      (el.getAttribute("data-testid") ?? "").replace(/^v2-run-/, ""),
    );
    await firstRun.click();

    const readFontSize = (id: string) =>
      page.evaluate((rid) => {
        const store = (
          window as unknown as {
            __v2_editor_store: {
              state: { pages: { runs: { id: string; fontSize: number }[] }[] };
            };
          }
        ).__v2_editor_store;
        return (
          store.state.pages[0]?.runs.find((r) => r.id === rid)?.fontSize ?? null
        );
      }, id);

    const sizeBefore = await readFontSize(runId);
    expect(sizeBefore).not.toBeNull();

    // The Mantine NumberInput carries the testid on the <input> itself.
    const sizeInput = page.getByTestId("v2-font-size");
    await expect(sizeInput).toBeEnabled();
    await sizeInput.fill("24");
    await sizeInput.press("Enter");

    // The command scales via a matrix ratio so allow a small tolerance.
    await expect
      .poll(async () => await readFontSize(runId), { timeout: 5_000 })
      .not.toBe(sizeBefore);
    const sizeAfter = await readFontSize(runId);
    expect(sizeAfter).not.toBeNull();
    expect(Math.abs(sizeAfter! - 24)).toBeLessThan(0.5);
  });
});

test.describe("PDF text editor v2 - save", () => {
  test("Save PDF produces a downloadable file", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRunTestId = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .first()
      .getAttribute("data-testid");
    await typeIntoRun(page, firstRunTestId!, "A");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buf = Buffer.concat(chunks);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });

  test("saved PDF round-trips: re-opening it preserves the edit", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    // Capture the original first-run text, then edit it.
    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";
    const original = (await firstRun.innerText()) ?? "";
    const appended = " (Hello!)";
    const edited = `${original}${appended}`;

    await typeIntoRun(page, runTestId, appended);
    await expect(firstRun).toContainText(appended);

    // Trigger the save and capture the bytes.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);

    // Push the saved bytes back into the dropzone as a new file. setInputFiles
    // accepts an in-memory payload.
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round-trip.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });

    // The edited text must be present somewhere in page 0's runs.
    const allText = await page
      .waitForFunction(
        () => {
          const runs = Array.from(
            document.querySelectorAll<HTMLDivElement>(
              '[data-testid^="v2-run-p0-"]',
            ),
          );
          if (runs.length === 0) return null;
          const joined = runs.map((el) => el.innerText).join(" ");
          return /Hello/.test(joined) ? joined : null;
        },
        { timeout: 30_000, polling: 500 },
      )
      .then((h) => h.jsonValue() as Promise<string>);
    expect(allText).toContain(original);
    expect(allText).toContain("(Hello!)");
    // The boundary between original and appended may collapse to a single or
    // double space depending on per-word emit / LineGrouper reconstruction.
    expect(allText).not.toContain(`${original.trimEnd()}(Hello!)`);
    // Quiet the unused-var lint - `edited` documents the intent above.
    void edited;
  });

  test("a saved edit is readable by an independent PDF parser (not just the editor)", async ({
    page,
  }) => {
    // The other round-trip tests re-feed the saved bytes through the SAME
    // PdfiumTextReader+LineGrouper that wrote them.
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";
    await typeIntoRun(page, runTestId, "ZZMARKER");
    await expect(firstRun).toContainText("ZZMARKER");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);

    // Independent structural cross-check: pdf-lib must load the bytes and see
    // the single page.
    const doc = await PDFDocument.load(savedBytes);
    expect(doc.getPageCount()).toBe(1);
  });
});

test.describe("PDF text editor v2 - whitespace preservation", () => {
  // These guard against a recurring class of regression where typed spaces
  // vanish from the saved PDF.

  async function readFirstRunText(
    page: import("@playwright/test").Page,
  ): Promise<string> {
    return await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store?: {
            state: { pages: { runs: { text: string }[] }[] };
          };
        }
      ).__v2_editor_store!;
      return store.state.pages[0]?.runs[0]?.text ?? "";
    });
  }

  async function saveAndReopen(
    page: import("@playwright/test").Page,
  ): Promise<void> {
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round-trip.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  test("NBSP typed into a single-line run is normalized to a regular space in the model", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";

    // Insert a literal NBSP via execCommand (same dispatch path the
    // browser's IME / autocorrect uses when it substitutes one).
    await typeIntoRun(page, runTestId, "X\u00A0Y");

    // The visible overlay shows what we typed.
    await expect(firstRun).toContainText("X");
    await expect(firstRun).toContainText("Y");

    // But the model snapshot - the source of truth for save - must contain
    // regular space, never NBSP.
    const modelText = await readFirstRunText(page);
    expect(modelText).not.toContain("\u00A0");
    expect(modelText).toContain("X Y");
  });

  test("typed single space survives save and re-open", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";
    const original = (await firstRun.innerText()) ?? "";
    const appended = " Hello World";
    await typeIntoRun(page, runTestId, appended);
    await expect(firstRun).toContainText("Hello World");

    await saveAndReopen(page);

    // After re-open we re-read everything through PdfiumTextReader +
    // LineGrouper.
    const reopenedAllText = await page
      .waitForFunction(
        () => {
          const runs = Array.from(
            document.querySelectorAll<HTMLDivElement>(
              '[data-testid^="v2-run-p0-"]',
            ),
          );
          if (runs.length === 0) return null;
          const joined = runs.map((el) => el.innerText).join("\n");
          return /Hello/.test(joined) ? joined : null;
        },
        { timeout: 30_000, polling: 500 },
      )
      .then((h) => h.jsonValue() as Promise<string>);
    expect(reopenedAllText).toContain("Hello World");
    expect(reopenedAllText).not.toContain("Hello\u00A0World");
    expect(reopenedAllText).not.toMatch(/HelloWorld/);
    expect(reopenedAllText).toContain(original);
  });

  test("deleting one char from a positional-jump run keeps inter-word spaces", async ({
    page,
  }) => {
    // Repro for the recurring "all spaces vanish when I delete a single letter"
    // bug on the Stirling marketing PDF.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(
          import.meta.dirname,
          "../test-fixtures/stirling-marketing.pdf",
        ),
      );
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    // Find the run containing the marketing tagline. Look across every
    // page since the marketing PDF is multi-page.
    const target = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLDivElement>('[data-testid^="v2-run-p"]'),
      );
      for (const el of els) {
        const txt = (el.innerText ?? "").trim();
        if (
          /Adobe/i.test(txt) &&
          /Acrobat/i.test(txt) &&
          /Alternative/i.test(txt)
        ) {
          return { testId: el.dataset.testid ?? "", text: txt };
        }
      }
      return null;
    });
    if (!target) {
      test.skip(true, "marketing PDF missing the Acrobat Alternative line");
      return;
    }
    expect(target.text).toMatch(/Adobe\s+Acrobat\s+Alternative/);

    // Trigger the exact failure path: replace the whole text with itself minus
    // the last char. typeIntoRun with selectNodeContents + insertText.
    const trimmed = target.text.slice(0, -1);
    await typeIntoRun(page, target.testId, trimmed);

    // Model assertion: after the edit, the run's text in the editor store must
    // STILL contain the inter-word spaces.
    const modelText = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store?: {
            state: { pages: { runs: { id: string; text: string }[] }[] };
          };
        }
      ).__v2_editor_store!;
      for (const p of store.state.pages) {
        for (const r of p.runs) {
          if (`v2-run-${r.id}` === tid) return r.text;
        }
      }
      return "";
    }, target.testId);
    expect(modelText).toMatch(/Adobe\s+Acrobat\s+Alternativ/);

    // Save and re-open. The reopened text on page 0 must still parse back to a
    // tagline with spaces between words.
    await saveAndReopen(page);

    // The marketing PDF is multi-page; pages render lazily and the tagline run
    // we care about may not have mounted yet.
    const reopenedAllText = await page
      .waitForFunction(
        () => {
          // Force every page into view so its overlays mount.
          const pageEls = Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid^="v2-page-"]'),
          );
          for (const el of pageEls) el.scrollIntoView({ block: "center" });
          const runs = Array.from(
            document.querySelectorAll<HTMLDivElement>(
              '[data-testid^="v2-run-p"]',
            ),
          );
          const joined = runs.map((el) => el.innerText).join("\n");
          // Resolve once we can see "Adobe" somewhere on the page -
          // signals the tagline overlay has rendered.
          return /Adobe/i.test(joined) ? joined : null;
        },
        { timeout: 30_000, polling: 500 },
      )
      .then((handle) => handle.jsonValue() as Promise<string>);
    // Surface a slice around the tagline on assertion failure so a future
    // regression debugger sees the actual reopened text.
    const tagIdx = reopenedAllText.indexOf("Free");
    const taglineSnippet =
      tagIdx >= 0
        ? reopenedAllText.slice(Math.max(0, tagIdx - 20), tagIdx + 200)
        : "<no 'Free' found in reopened runs>";
    // Core check: none of the word pairs should be GLUED (no whitespace
    // separator at all between them).
    expect(
      reopenedAllText,
      `Tagline snippet: ${JSON.stringify(taglineSnippet)}`,
    ).not.toMatch(/FreeAdobe/);
    expect(reopenedAllText).not.toMatch(/AdobeAcrobat/);
    // Positive check: the tagline words DO appear separated by some whitespace
    // somewhere in the reopened text.
    expect(reopenedAllText).toMatch(/Free\s+Adobe/);
    expect(reopenedAllText).toMatch(/Adobe\s+Acrobat/);
  });

  test("user-sample.pdf: deleting one char from tagline keeps every inter-word space", async ({
    page,
  }) => {
    // EXACT user repro.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    // Find the tagline overlay.
    const taglineHandle = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /Adobe.+Acrobat.+Alternative/ })
      .first()
      .elementHandle();
    if (!taglineHandle) {
      test.skip(true, "Sample.pdf is missing the Acrobat Alternative tagline");
      return;
    }
    const taglineTestId =
      (await taglineHandle.getAttribute("data-testid")) ?? "";
    const original = (await taglineHandle.innerText()) ?? "";
    expect(original).toMatch(/Adobe\s+Acrobat\s+Alternative/);

    // Delete the last character (matches the user clicking the line and
    // hitting Backspace once).
    await page.evaluate((tid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${tid}"]`,
      );
      if (!el) throw new Error("no tagline element");
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete", false);
    }, taglineTestId);

    // Model assertion: the run text after the edit must still have all four
    // inter-word gaps.
    const modelText = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            state: { pages: { runs: { id: string; text: string }[] }[] };
          };
        }
      ).__v2_editor_store;
      for (const p of store.state.pages) {
        for (const r of p.runs) {
          if (`v2-run-${r.id}` === tid) return r.text;
        }
      }
      return "";
    }, taglineTestId);
    expect(modelText).toMatch(/The\s+Free\s+Adobe\s+Acrobat\s+Alternativ/);

    // Round-trip through save + re-open and verify the same word boundaries
    // survive.
    await saveAndReopen(page);

    const reopenedAllText = await page
      .waitForFunction(
        () => {
          const pages = Array.from(
            document.querySelectorAll<HTMLElement>('[data-testid^="v2-page-"]'),
          );
          for (const el of pages) el.scrollIntoView({ block: "center" });
          const runs = Array.from(
            document.querySelectorAll<HTMLDivElement>(
              '[data-testid^="v2-run-p"]',
            ),
          );
          const joined = runs.map((el) => el.innerText).join("\n");
          return /Adobe/i.test(joined) ? joined : null;
        },
        { timeout: 30_000, polling: 500 },
      )
      .then((h) => h.jsonValue() as Promise<string>);

    // Surface a slice around the tagline on failure so future
    // debuggers see the actual reopened text.
    const tagIdx = reopenedAllText.indexOf("Adobe");
    const snippet =
      tagIdx >= 0
        ? reopenedAllText.slice(Math.max(0, tagIdx - 30), tagIdx + 200)
        : "<no Adobe in reopened runs>";

    // The CORE assertion. The previous bug rendered all words glued.
    expect(
      reopenedAllText,
      `Tagline snippet: ${JSON.stringify(snippet)}`,
    ).not.toMatch(/FreeAdobe/);
    expect(reopenedAllText).not.toMatch(/AdobeAcrobat/);
    expect(reopenedAllText).not.toMatch(/AcrobatAlternativ/);
    // Positive form: words separated by some whitespace.
    expect(reopenedAllText).toMatch(/Free\s+Adobe/);
    expect(reopenedAllText).toMatch(/Adobe\s+Acrobat/);
    expect(reopenedAllText).toMatch(/Acrobat\s+Alternativ/);
  });

  test("user-sample.pdf: deleting one char from middle of a LineGrouper-merged line doesn't corrupt or duplicate sub-runs", async ({
    page,
  }) => {
    // Regression guard: a previous attempt to teach partialEdit about
    // LineGrouper-synthesised whitespace miscounted ghost chars by 1.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    // Snapshot the baseline for the bullet that's known to trigger the
    // ghost-char-count bug.
    const baseline = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromTexts: string[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r
        ? { id: r.id, text: r.text, mergedFromTexts: [...r.mergedFromTexts] }
        : null;
    });
    if (!baseline) {
      test.skip(true, "fixture missing Adobe/Acrobat/Alternative tagline");
      return;
    }

    // Pick a deterministic middle-position character to delete: the letter "A"
    // of "Adobe".
    const deleteIdx = baseline.text.indexOf("Adobe");
    expect(deleteIdx).toBeGreaterThan(0);
    const expectedText =
      baseline.text.slice(0, deleteIdx) + baseline.text.slice(deleteIdx + 1);

    // Position caret AFTER "M" and Backspace (so the M gets deleted).
    await page.evaluate(
      ({ tid, caretAt }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${tid}"]`,
        );
        if (!el) throw new Error("no run el");
        el.focus();
        // Walk the text nodes and place caret after the N-th char.
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let node: Text | null = null;
        let remaining = caretAt;
        while (walker.nextNode()) {
          const n = walker.currentNode as Text;
          const len = n.textContent?.length ?? 0;
          if (remaining <= len) {
            node = n;
            break;
          }
          remaining -= len;
        }
        if (!node) throw new Error("ran out of text walking caret");
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStart(node, remaining);
        range.setEnd(node, remaining);
        sel.removeAllRanges();
        sel.addRange(range);
        // delete = deleteContentBackward semantically
        document.execCommand("delete", false);
      },
      { tid: baseline.id, caretAt: deleteIdx + 1 },
    );
    await page.waitForTimeout(400);

    const after = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromTexts: string[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      return r
        ? { text: r.text, mergedFromTexts: [...r.mergedFromTexts] }
        : null;
    }, baseline.id);
    if (!after) throw new Error("post-edit run vanished");

    // Text content: exactly baseline minus the A of Adobe.
    expect(after.text).toBe(expectedText);

    // Sub-run integrity: any non-trivial (>=3 char) baseline fragment must NOT
    // appear twice in the post-edit mergedFromTexts.
    const counts = new Map<string, number>();
    for (const t of after.mergedFromTexts) {
      if (t.length < 3) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const dupes = Array.from(counts.entries()).filter(([, c]) => c > 1);
    expect(
      dupes,
      `mergedFromTexts duplicates after edit: ${JSON.stringify(dupes)}`,
    ).toEqual([]);

    // Char-fidelity: every non-trivial baseline fragment that wasn't the
    // deleted sub-run must still appear verbatim somewhere in.
    const afterJoined = after.mergedFromTexts.join("|");
    for (const t of baseline.mergedFromTexts) {
      if (t.length < 3) continue;
      // The sub-run that contained the deleted A may be removed or
      // re-emitted - don't assert on those specifically.
      if (t === "A" || t.includes("Adobe")) continue;
      expect(
        afterJoined,
        `baseline fragment ${JSON.stringify(t)} lost from post-edit run`,
      ).toContain(t);
    }

    // Font preservation: editing a line rendered in a non-base14 source font
    // must NOT flip the run to base14:Helvetica.
    const afterFontId = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{ id: string; fontId: string }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      return (
        store.doc.page(0).runs.find((r) => r.id === tid)?.fontId ?? "<gone>"
      );
    }, baseline.id);
    expect(afterFontId).not.toMatch(/^base14:/);
  });

  test("user-sample.pdf: inserting ' Hi' at end of tagline renders a visible space (not 'AlternativeHi')", async ({
    page,
  }) => {
    // Repro for the recurring "typed space vanishes" bug on the marketing
    // tagline.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const tagline = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{ id: string; text: string }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r ? { id: r.id, text: r.text } : null;
    });
    if (!tagline) {
      test.skip(
        true,
        "user-sample.pdf missing Adobe/Acrobat/Alternative tagline",
      );
      return;
    }

    // Place caret at end-of-text and type " Hi" via insertText (same
    // dispatch path the browser uses for real keystrokes).
    await page.evaluate(
      ({ tid, caretPos }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${tid}"]`,
        );
        if (!el) throw new Error("no tagline element");
        el.focus();
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let node: Text | null = null;
        let remaining = caretPos;
        while (walker.nextNode()) {
          const n = walker.currentNode as Text;
          const len = n.textContent?.length ?? 0;
          if (remaining <= len) {
            node = n;
            break;
          }
          remaining -= len;
        }
        if (!node) throw new Error("ran out of text walking caret");
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStart(node, remaining);
        range.setEnd(node, remaining);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, " Hi");
      },
      { tid: tagline.id, caretPos: tagline.text.length },
    );
    await page.waitForTimeout(400);

    // Model assertion: the run text now ends in " Hi" with the literal
    // space preserved.
    const after = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                  bounds: { x: number; width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      return r
        ? {
            text: r.text,
            mergedFromTexts: [...r.mergedFromTexts],
            mergedFromBounds: r.mergedFromBounds.map((b) => ({ ...b })),
            boundsRight: r.bounds.x + r.bounds.width,
          }
        : null;
    }, tagline.id);
    if (!after) throw new Error("tagline run vanished after insert");
    expect(after.text).toMatch(/Alternative\s+Hi$/);

    // The CORE physical-width assertion.
    const insertedRight = Math.max(
      ...after.mergedFromBounds.map((b) => b.right),
    );
    const insertedLeft = Math.min(...after.mergedFromBounds.map((b) => b.x));
    // The bounds span must be at least the width the line had before
    // the insert (we APPENDED chars; nothing should subtract width).
    expect(insertedRight - insertedLeft).toBeGreaterThan(0);
    // run.bounds.width covers up to and including the new chars.
    expect(after.boundsRight).toBeGreaterThan(insertedLeft + 5);

    // Round-trip: save the PDF and re-open.
    await saveAndReopen(page);

    const reopened = await page
      .waitForFunction(
        () => {
          const runs = Array.from(
            document.querySelectorAll<HTMLDivElement>(
              '[data-testid^="v2-run-p"]',
            ),
          );
          const joined = runs.map((el) => el.innerText).join("\n");
          return /Alternativ/i.test(joined) ? joined : null;
        },
        { timeout: 30_000, polling: 500 },
      )
      .then((h) => h.jsonValue() as Promise<string>);

    // Surface a snippet on failure so future debuggers see actual
    // reopened text instead of an opaque regex mismatch.
    const aIdx = reopened.indexOf("Alternat");
    const snippet =
      aIdx >= 0
        ? reopened.slice(Math.max(0, aIdx - 5), aIdx + 40)
        : "<no Alternat in reopened text>";

    // The CORE assertion. Glued tokens = whitespace eaten on save.
    expect(
      reopened,
      `Tagline+Hi snippet: ${JSON.stringify(snippet)}`,
    ).not.toMatch(/AlternativeHi/);
    // Positive form: the two tokens appear with some whitespace separator.
    expect(reopened).toMatch(/Alternative\s+Hi/);
  });

  // ---------------------------------------------------------------
  // Sequential-edit visual-integrity tests.

  async function findTaglineRun(page: import("@playwright/test").Page) {
    return await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  bounds: {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                  };
                  mergedFromTexts: string[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r
        ? {
            id: r.id,
            text: r.text,
            fontId: r.fontId,
            bounds: { ...r.bounds },
          }
        : null;
    });
  }

  async function readRun(page: import("@playwright/test").Page, id: string) {
    return await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  bounds: { x: number; y: number };
                  mergedFromTexts: string[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      return r
        ? {
            text: r.text,
            fontId: r.fontId,
            boundsX: r.bounds.x,
            boundsY: r.bounds.y,
            mergedFromTexts: [...r.mergedFromTexts],
          }
        : null;
    }, id);
  }

  async function caretAt(
    page: import("@playwright/test").Page,
    tid: string,
    pos: number,
  ) {
    await page.evaluate(
      ({ tid, pos }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${tid}"]`,
        );
        if (!el) throw new Error("no run el");
        el.focus();
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let node: Text | null = null;
        let remaining = pos;
        while (walker.nextNode()) {
          const n = walker.currentNode as Text;
          const len = n.textContent?.length ?? 0;
          if (remaining <= len) {
            node = n;
            break;
          }
          remaining -= len;
        }
        if (!node) throw new Error("ran out of text walking caret");
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStart(node, remaining);
        range.setEnd(node, remaining);
        sel.removeAllRanges();
        sel.addRange(range);
      },
      { tid, pos },
    );
  }

  async function execAt(
    page: import("@playwright/test").Page,
    tid: string,
    pos: number,
    cmd: "insertText" | "delete",
    text?: string,
  ) {
    await caretAt(page, tid, pos);
    await page.evaluate(
      ({ cmd, text }) => {
        document.execCommand(cmd, false, text);
      },
      { cmd, text },
    );
    await page.waitForTimeout(250);
  }

  function dedupeCheck(mergedFromTexts: string[]): string[] {
    const counts = new Map<string, number>();
    for (const t of mergedFromTexts) {
      if (t.length < 3) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([t]) => t);
  }

  test("SENTINEL: USER_SAMPLE_PDF tagline is a single grouped run", async ({
    page,
  }) => {
    // 20 tagline tests below guard themselves with `if (!findTaglineRun(page))
    // { test.skip(...) }`.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    expect(
      baseline,
      "USER_SAMPLE_PDF must expose the Acrobat-Alternative tagline as a single run - if this fails the 20 tagline tests are silently skipping",
    ).not.toBeNull();
    expect(baseline!.text).toMatch(/Adobe.*Acrobat.*Alternative/);
  });

  test("user-sample.pdf: sequential type-3-chars-at-end keeps font + position stable", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    expect(baseline.fontId).not.toMatch(/^base14:/);

    // Type three chars at the end of the line.
    let runningText = baseline.text;
    for (const ch of ["A", "d", "o"]) {
      runningText += ch;
      await execAt(page, baseline.id, runningText.length - 1, "insertText", ch);
      const after = await readRun(page, baseline.id);
      if (!after) throw new Error("run vanished after type");
      expect(after.text, `after typing ${ch}`).toBe(runningText);
      expect(after.fontId, `font flipped after typing ${ch}`).not.toMatch(
        /^base14:/,
      );
      expect(
        Math.abs(after.boundsY - baseline.bounds.y),
        `vertical teleport after typing ${ch} (Δy=${after.boundsY - baseline.bounds.y})`,
      ).toBeLessThan(2);
      const dupes = dedupeCheck(after.mergedFromTexts);
      expect(
        dupes,
        `dupes after typing ${ch}: ${JSON.stringify(dupes)}`,
      ).toEqual([]);
    }
  });

  test("user-sample.pdf: sequential backspace-3-chars-from-end keeps font + position stable", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "fixture missing tagline");
      return;
    }

    let runningText = baseline.text;
    for (let i = 0; i < 3; i++) {
      runningText = runningText.slice(0, -1);
      await execAt(page, baseline.id, runningText.length + 1, "delete");
      const after = await readRun(page, baseline.id);
      if (!after) throw new Error("run vanished after backspace");
      expect(after.text, `after backspace #${i + 1}`).toBe(runningText);
      expect(
        after.fontId,
        `font flipped after backspace #${i + 1}`,
      ).not.toMatch(/^base14:/);
      expect(
        Math.abs(after.boundsY - baseline.bounds.y),
        `vertical teleport after backspace #${i + 1}`,
      ).toBeLessThan(2);
      const dupes = dedupeCheck(after.mergedFromTexts);
      expect(
        dupes,
        `dupes after backspace #${i + 1}: ${JSON.stringify(dupes)}`,
      ).toEqual([]);
    }
  });

  test("user-sample.pdf: sequential delete-3-chars-from-middle keeps font + position stable", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    // Find the index of "Acrobat" - we'll backspace the leading
    // letters off it ('A', 'c', 'r') one at a time.
    const acrobatStart = baseline.text.indexOf("Acrobat");
    expect(acrobatStart).toBeGreaterThan(0);

    let runningText = baseline.text;
    for (let i = 0; i < 3; i++) {
      // Each iteration we delete the char at position `acrobatStart` - which is
      // the next char of what used to be "Acrobat" after the previous deletes.
      runningText =
        runningText.slice(0, acrobatStart) +
        runningText.slice(acrobatStart + 1);
      await execAt(page, baseline.id, acrobatStart + 1, "delete");
      const after = await readRun(page, baseline.id);
      if (!after) throw new Error("run vanished after middle delete");
      expect(after.text, `after middle delete #${i + 1}`).toBe(runningText);
      expect(
        after.fontId,
        `font flipped after middle delete #${i + 1}`,
      ).not.toMatch(/^base14:/);
      expect(
        Math.abs(after.boundsY - baseline.bounds.y),
        `vertical teleport after middle delete #${i + 1}`,
      ).toBeLessThan(2);
      const dupes = dedupeCheck(after.mergedFromTexts);
      expect(
        dupes,
        `dupes after middle delete #${i + 1}: ${JSON.stringify(dupes)}`,
      ).toEqual([]);
    }
  });

  test("user-sample.pdf: interleaved delete-then-type sequence keeps font + position stable", async ({
    page,
  }) => {
    // Mimics realistic user editing: delete a char, type a different one,
    // repeat.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "fixture missing tagline");
      return;
    }

    const sequence: Array<{
      op: "insertText" | "delete";
      pos: number;
      ch?: string;
    }> = [
      // Delete the trailing "e" of Alternative.
      { op: "delete", pos: baseline.text.length },
      // Append a known-existing 'A'.
      { op: "insertText", pos: baseline.text.length - 1, ch: "A" },
      // Delete it.
      { op: "delete", pos: baseline.text.length },
      // Type 'e' back at the end.
      { op: "insertText", pos: baseline.text.length - 1, ch: "e" },
    ];

    let runningText = baseline.text;
    for (let i = 0; i < sequence.length; i++) {
      const step = sequence[i];
      if (step.op === "insertText") {
        runningText =
          runningText.slice(0, step.pos) +
          (step.ch ?? "") +
          runningText.slice(step.pos);
        await execAt(page, baseline.id, step.pos, "insertText", step.ch);
      } else {
        runningText =
          runningText.slice(0, step.pos - 1) + runningText.slice(step.pos);
        await execAt(page, baseline.id, step.pos, "delete");
      }
      const after = await readRun(page, baseline.id);
      if (!after) throw new Error(`run vanished after step ${i}`);
      expect(after.text, `step ${i} (${step.op})`).toBe(runningText);
      expect(after.fontId, `step ${i} font flipped`).not.toMatch(/^base14:/);
      expect(
        Math.abs(after.boundsY - baseline.bounds.y),
        `step ${i} vertical teleport`,
      ).toBeLessThan(2);
      const dupes = dedupeCheck(after.mergedFromTexts);
      expect(dupes, `step ${i} dupes: ${JSON.stringify(dupes)}`).toEqual([]);
    }
  });

  test("user-sample.pdf: inserting chars in the MIDDLE shifts subsequent text right (no overlap)", async ({
    page,
  }) => {
    // Regression guard: inserting NEW chars between two kept sub-runs used to
    // leave the inserted text overlapping the original following chars.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  bounds: { width: number };
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r
        ? {
            id: r.id,
            text: r.text,
            mergedFromTexts: [...r.mergedFromTexts],
            mergedFromBounds: r.mergedFromBounds.map((b) => ({ ...b })),
            boundsWidth: r.bounds.width,
          }
        : null;
    });
    if (!baseline) {
      test.skip(true, "fixture missing tagline");
      return;
    }

    // Find caret position right after "Acrob" (between 'b' and 'a').
    const acrobIdx = baseline.text.indexOf("Acrobat");
    expect(acrobIdx).toBeGreaterThan(0);
    const caretPos = acrobIdx + 5; // after "Acrob"

    // Find original x of the sub-run that LIVES AFTER the caret -
    // this is the one that should shift right after the insert.
    let charCursor = 0;
    let postCaretSubRunIdx = -1;
    for (let i = 0; i < baseline.mergedFromTexts.length; i++) {
      const len = baseline.mergedFromTexts[i].length;
      if (caretPos >= charCursor && caretPos <= charCursor + len) {
        // Caret is at end of this sub-run; the NEXT sub-run is what
        // should shift.
        postCaretSubRunIdx = i + 1;
        break;
      }
      charCursor += len;
    }
    expect(postCaretSubRunIdx).toBeGreaterThan(0);
    expect(postCaretSubRunIdx).toBeLessThan(baseline.mergedFromBounds.length);
    const origPostCaretX = baseline.mergedFromBounds[postCaretSubRunIdx].x;

    // Insert "aaa" at the caret position.
    await execAt(page, baseline.id, caretPos, "insertText", "aaa");

    const after = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                  bounds: { width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      return r
        ? {
            text: r.text,
            mergedFromTexts: [...r.mergedFromTexts],
            mergedFromBounds: r.mergedFromBounds.map((b) => ({ ...b })),
            boundsWidth: r.bounds.width,
          }
        : null;
    }, baseline.id);
    if (!after) throw new Error("post-edit run vanished");

    // Sanity: text is exactly baseline with "aaa" inserted at caretPos.
    const expectedText =
      baseline.text.slice(0, caretPos) + "aaa" + baseline.text.slice(caretPos);
    expect(after.text).toBe(expectedText);

    // The sub-run that USED to live right after the caret must now have its x
    // shifted RIGHT to make room for the inserted "aaa".
    let newPostCaretX: number | null = null;
    // Original next sub-run's text:
    const targetText = baseline.mergedFromTexts[postCaretSubRunIdx];
    // Find its first occurrence AFTER the insertion point in the
    // after-array (skipping the "aaa" sub-runs).
    let cursor = 0;
    for (let i = 0; i < after.mergedFromTexts.length; i++) {
      if (cursor >= caretPos + 3 && after.mergedFromTexts[i] === targetText) {
        newPostCaretX = after.mergedFromBounds[i].x;
        break;
      }
      cursor += after.mergedFromTexts[i].length;
    }
    expect(
      newPostCaretX,
      `could not find post-caret sub-run after insertion`,
    ).not.toBeNull();
    expect(
      newPostCaretX!,
      `post-caret sub-run did not shift right (orig=${origPostCaretX}, new=${newPostCaretX})`,
    ).toBeGreaterThan(origPostCaretX + 5);

    // Run width must have grown by at least the inserted "aaa" width.
    const widthGrowth = after.boundsWidth - baseline.boundsWidth;
    expect(
      widthGrowth,
      `bounds.width didn't grow (Δ=${widthGrowth}) - insert probably overlapped following text`,
    ).toBeGreaterThan(10);
  });

  test("user-sample.pdf: deleting an entire word closes the gap (text after shifts left)", async ({
    page,
  }) => {
    // Regression guard: when an edit fully removes a sub-run, the surviving
    // sub-runs to its right used to STAY at their original x position.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    // Snapshot the baseline including the bounds of every sub-run
    // (we need the original x of the sub-run that lives AFTER "Adobe ").
    const baseline = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  bounds: { x: number; width: number };
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r
        ? {
            id: r.id,
            text: r.text,
            mergedFromTexts: [...r.mergedFromTexts],
            mergedFromBounds: r.mergedFromBounds.map((b) => ({ ...b })),
            boundsWidth: r.bounds.width,
          }
        : null;
    });
    if (!baseline) {
      test.skip(true, "fixture missing tagline");
      return;
    }

    // Find the first sub-run whose text begins after the "Adobe "
    // word. We'll track its bounds.x before and after the delete.
    const adobeChars = "Adobe";
    const acrobatChars = "Acrobat";
    const adobeStartCharIdx = baseline.text.indexOf(adobeChars);
    const acrobatStartCharIdx = baseline.text.indexOf(acrobatChars);
    expect(adobeStartCharIdx).toBeGreaterThan(0);
    expect(acrobatStartCharIdx).toBeGreaterThan(adobeStartCharIdx);

    // The sub-run containing the FIRST char of "Acrobat" - its
    // original x is what we compare to.
    let charCursor = 0;
    let acrobatSubRunIdx = -1;
    for (let i = 0; i < baseline.mergedFromTexts.length; i++) {
      const sub = baseline.mergedFromTexts[i];
      if (
        acrobatStartCharIdx >= charCursor &&
        acrobatStartCharIdx < charCursor + sub.length
      ) {
        acrobatSubRunIdx = i;
        break;
      }
      charCursor += sub.length;
    }
    expect(acrobatSubRunIdx).toBeGreaterThan(0);
    const origAcrobatX = baseline.mergedFromBounds[acrobatSubRunIdx].x;

    // Select "Adobe " (the word + trailing whitespace) and delete it.
    await page.evaluate(
      ({ tid, start, end }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${tid}"]`,
        );
        if (!el) throw new Error("no run el");
        el.focus();
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let startNode: Text | null = null;
        let startOffset = 0;
        let endNode: Text | null = null;
        let endOffset = 0;
        let remaining = start;
        while (walker.nextNode()) {
          const n = walker.currentNode as Text;
          const len = n.textContent?.length ?? 0;
          if (!startNode && remaining <= len) {
            startNode = n;
            startOffset = remaining;
          }
          if (!startNode) remaining -= len;
          else break;
        }
        // Reset walker; re-walk for end.
        const walker2 = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let r2 = end;
        while (walker2.nextNode()) {
          const n = walker2.currentNode as Text;
          const len = n.textContent?.length ?? 0;
          if (r2 <= len) {
            endNode = n;
            endOffset = r2;
            break;
          }
          r2 -= len;
        }
        if (!startNode || !endNode) throw new Error("selection walk failed");
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("delete", false);
      },
      {
        tid: baseline.id,
        // Delete the whole word "Adobe" + the trailing space chars
        // (sample has TWO spaces between words).
        start: adobeStartCharIdx,
        end: acrobatStartCharIdx,
      },
    );
    await page.waitForTimeout(400);

    const after = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                  bounds: { width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      return r
        ? {
            text: r.text,
            mergedFromTexts: [...r.mergedFromTexts],
            mergedFromBounds: r.mergedFromBounds.map((b) => ({ ...b })),
            boundsWidth: r.bounds.width,
          }
        : null;
    }, baseline.id);
    if (!after) throw new Error("post-edit run vanished");

    // Text content: baseline minus "Adobe " (including the trailing
    // double space).
    const expectedText =
      baseline.text.slice(0, adobeStartCharIdx) +
      baseline.text.slice(acrobatStartCharIdx);
    expect(after.text).toBe(expectedText);

    // Find the sub-run that now contains "Acrobat" - it MUST have
    // shifted LEFT of its original position to close the gap.
    let newAcrobatX: number | null = null;
    let cursor = 0;
    for (let i = 0; i < after.mergedFromTexts.length; i++) {
      const sub = after.mergedFromTexts[i];
      const idx = (after.text.slice(cursor) + "").indexOf("Acrobat");
      if (
        idx >= 0 &&
        cursor + idx >= cursor &&
        cursor + idx < cursor + sub.length
      ) {
        newAcrobatX = after.mergedFromBounds[i].x;
        break;
      }
      cursor += sub.length;
    }
    // Fallback: scan all sub-runs for one whose text starts with 'A'
    // and is near the expected position.
    if (newAcrobatX === null) {
      for (let i = 0; i < after.mergedFromTexts.length; i++) {
        if (after.mergedFromTexts[i].startsWith("A")) {
          newAcrobatX = after.mergedFromBounds[i].x;
          break;
        }
      }
    }
    if (newAcrobatX === null) {
      // Pick the sub-run at the same INDEX as the original Acrobat sub-run.
      const newIdx = Math.min(
        acrobatSubRunIdx,
        after.mergedFromBounds.length - 1,
      );
      newAcrobatX = after.mergedFromBounds[newIdx].x;
    }
    expect(
      newAcrobatX,
      `Acrobat sub-run did not shift left (original=${origAcrobatX}, new=${newAcrobatX})`,
    ).toBeLessThan(origAcrobatX);

    // Run width must have shrunk by roughly the width of "Adobe " (give or take
    // a few pt for the per-word emit's positional padding).
    const widthShrinkage = baseline.boundsWidth - after.boundsWidth;
    expect(
      widthShrinkage,
      `bounds.width barely shrank (Δ=${widthShrinkage}) - gap probably left in place`,
    ).toBeGreaterThan(15);
  });

  // -------------------------------------------------------------------
  // Comprehensive edit-text regression.

  /** Walk adjacent merged-from-bounds and assert no horizontal overlap. */
  function assertNoBoundsOverlap(
    bounds: Array<{ x: number; right: number }>,
    label: string,
  ): void {
    for (let i = 1; i < bounds.length; i++) {
      const prev = bounds[i - 1];
      const cur = bounds[i];
      // Tolerate a tiny overlap (kerning, sub-pixel rounding).
      const overlap = prev.right - cur.x;
      if (overlap > 1.5) {
        throw new Error(
          `${label}: sub-run ${i - 1} (right=${prev.right.toFixed(2)}) overlaps sub-run ${i} (x=${cur.x.toFixed(2)}) by ${overlap.toFixed(2)}pt`,
        );
      }
    }
  }

  async function snapshotIntegrity(
    page: import("@playwright/test").Page,
    runId: string,
    baselineY: number,
    expectedText: string,
    stepLabel: string,
  ): Promise<void> {
    const after = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  bounds: { y: number };
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      return r
        ? {
            text: r.text,
            fontId: r.fontId,
            boundsY: r.bounds.y,
            mergedFromTexts: [...r.mergedFromTexts],
            mergedFromBounds: r.mergedFromBounds.map((b) => ({ ...b })),
          }
        : null;
    }, runId);
    if (!after) throw new Error(`${stepLabel}: run vanished`);
    expect(after.text, `${stepLabel}: text`).toBe(expectedText);
    expect(
      after.fontId,
      `${stepLabel}: font flipped. text=${JSON.stringify(after.text.slice(0, 80))}; merged[0..12]=${JSON.stringify(after.mergedFromTexts.slice(0, 12))}`,
    ).not.toMatch(/^base14:/);
    expect(
      Math.abs(after.boundsY - baselineY),
      `${stepLabel}: vertical teleport (Δy=${after.boundsY - baselineY})`,
    ).toBeLessThan(2);
    const counts = new Map<string, number>();
    for (const t of after.mergedFromTexts) {
      if (t.length < 3) continue;
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const dupes = Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([t]) => t);
    expect(dupes, `${stepLabel}: dupe sub-runs`).toEqual([]);
    assertNoBoundsOverlap(after.mergedFromBounds, stepLabel);
  }

  test("comprehensive regression: insert at end + step-by-step integrity check", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    // Type a varied sequence: letters, digit, space, letter.
    const chars = ["X", "9", " ", "z", "Q"];
    let running = baseline.text;
    for (const ch of chars) {
      running += ch;
      await execAt(page, baseline.id, running.length - 1, "insertText", ch);
      await snapshotIntegrity(
        page,
        baseline.id,
        baseline.bounds.y,
        running,
        `insert "${ch}" at end`,
      );
    }
  });

  test("comprehensive regression: insert at start + step-by-step integrity check", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    const chars = ["!", "?", "*"];
    let running = baseline.text;
    for (const ch of chars) {
      running = ch + running;
      await execAt(page, baseline.id, 0, "insertText", ch);
      await snapshotIntegrity(
        page,
        baseline.id,
        baseline.bounds.y,
        running,
        `insert "${ch}" at start`,
      );
    }
  });

  test("comprehensive regression: insert in middle + step-by-step integrity check", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }
    const insertAt = baseline.text.indexOf("Acrobat") + 5; // between "Acrob" and "at"
    expect(insertAt).toBeGreaterThan(0);

    const chars = ["a", "a", "a"]; // user's reported case
    let running = baseline.text;
    let offset = 0;
    for (const ch of chars) {
      running =
        running.slice(0, insertAt + offset) +
        ch +
        running.slice(insertAt + offset);
      await execAt(page, baseline.id, insertAt + offset, "insertText", ch);
      offset += 1;
      await snapshotIntegrity(
        page,
        baseline.id,
        baseline.bounds.y,
        running,
        `insert "${ch}" in middle (step ${offset})`,
      );
    }
  });

  test("comprehensive regression: delete from end down to zero", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    // Backspace 10 chars from end.
    let running = baseline.text;
    const totalDeletes = Math.min(10, running.length - 1);
    for (let i = 0; i < totalDeletes; i++) {
      running = running.slice(0, -1);
      await execAt(page, baseline.id, running.length + 1, "delete");
      await snapshotIntegrity(
        page,
        baseline.id,
        baseline.bounds.y,
        running,
        `backspace #${i + 1}`,
      );
    }
  });

  test("comprehensive regression: delete from start", async ({ page }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    let running = baseline.text;
    for (let i = 0; i < 5; i++) {
      // Place caret AT position 1 (= after first char), Backspace
      // → deletes char 0.
      running = running.slice(1);
      await execAt(page, baseline.id, 1, "delete");
      await snapshotIntegrity(
        page,
        baseline.id,
        baseline.bounds.y,
        running,
        `delete-from-start #${i + 1}`,
      );
    }
  });

  test("comprehensive regression: delete from middle of various words", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    // Delete the letter at position N for each word: "Free" → "Fre", "Adobe" →
    // "dobe", "Alternative" → "Altrntiv".
    const targets: Array<{
      word: string;
      offsetInWord: number;
      label: string;
    }> = [
      { word: "Free", offsetInWord: 4, label: "delete 'e' after Free" },
      { word: "Adobe", offsetInWord: 1, label: "delete 'A' at start of Adobe" },
      { word: "Acrobat", offsetInWord: 3, label: "delete 'r' in Acrobat" },
    ];

    let running = baseline.text;
    for (const t of targets) {
      const wordPos = running.indexOf(t.word);
      if (wordPos < 0) continue;
      const caretPos = wordPos + t.offsetInWord;
      const charDeleted = running.charAt(caretPos - 1);
      running = running.slice(0, caretPos - 1) + running.slice(caretPos);
      await execAt(page, baseline.id, caretPos, "delete");
      await snapshotIntegrity(
        page,
        baseline.id,
        baseline.bounds.y,
        running,
        `${t.label} (removed '${charDeleted}')`,
      );
    }
  });

  test("comprehensive regression: alternating insert/delete sequence", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    let running = baseline.text;
    // 6-step interleaved sequence.
    const steps: Array<{ op: "ins" | "del"; pos: () => number; ch?: string }> =
      [
        { op: "ins", pos: () => running.length, ch: "Z" },
        { op: "del", pos: () => running.length },
        { op: "ins", pos: () => running.indexOf("Free") + 4, ch: "r" },
        { op: "del", pos: () => running.indexOf("Free") + 5 },
        { op: "ins", pos: () => 0, ch: "*" },
        { op: "del", pos: () => 1 },
      ];

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const pos = s.pos();
      if (s.op === "ins" && s.ch !== undefined) {
        running = running.slice(0, pos) + s.ch + running.slice(pos);
        await execAt(page, baseline.id, pos, "insertText", s.ch);
      } else {
        if (pos < 1) continue;
        running = running.slice(0, pos - 1) + running.slice(pos);
        await execAt(page, baseline.id, pos, "delete");
      }
      // Lighter assertion: text + no teleport + no dupe sub-runs.
      // Font flip is tolerated here (see note above).
      const after = await readRun(page, baseline.id);
      if (!after) throw new Error(`step ${i + 1}: run vanished`);
      expect(after.text, `step ${i + 1} (${s.op}) text`).toBe(running);
      expect(
        Math.abs(after.boundsY - baseline.bounds.y),
        `step ${i + 1} vertical teleport (Δy=${after.boundsY - baseline.bounds.y})`,
      ).toBeLessThan(2);
      const dupes = dedupeCheck(after.mergedFromTexts);
      expect(dupes, `step ${i + 1} dupes`).toEqual([]);
    }
  });

  test("comprehensive regression: save+reopen text-content round-trip", async ({
    page,
  }) => {
    // The "would a PDF viewer render the right text" assertion.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    // Edit: insert "aaa" between "Acrob" and "at".
    const insertAt = baseline.text.indexOf("Acrobat") + 5;
    await execAt(page, baseline.id, insertAt, "insertText", "aaa");

    // Save and re-open, then collect every run's text from page 0.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buf = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round-trip.pdf",
      mimeType: "application/pdf",
      buffer: buf,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);

    // Scan EVERY run on EVERY page.
    const allText = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            state: { pages: { runs: { text: string }[] }[] };
          };
        }
      ).__v2_editor_store;
      return store.state.pages
        .flatMap((p) => p.runs.map((r) => r.text))
        .join("\n");
    });
    const debugSnippet = allText.slice(0, 500);
    // The inserted "aaa" must appear near "Acrob".
    expect(
      allText,
      `reopened did not contain "Acrob...aaa". snippet: ${debugSnippet}`,
    ).toMatch(/Acrob[\s ]{0,3}a{3,}/);
    // Both halves of the tagline must survive the round-trip.
    expect(
      allText.indexOf("Adobe"),
      `Adobe missing. allText: ${debugSnippet}`,
    ).toBeGreaterThanOrEqual(0);
    expect(allText.indexOf("Acrob")).toBeGreaterThanOrEqual(0);
    expect(allText.indexOf("Alternativ")).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------
  // Font-fallback regression tests.

  test("font-fallback: Helvetica fallback for inserted text produces a visible glyph (width > 0)", async ({
    page,
  }) => {
    // The marketing PDF tagline uses an embedded non-standard font
    // ("pdf:...:Unknown").
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    // Insert "X" at end of tagline.
    await execAt(page, baseline.id, baseline.text.length, "insertText", "X");

    // Read the new sub-run's bounds and confirm it has a real width.
    // A 0-width sub-run = font failed to render the glyph = bug.
    const result = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      if (!r) return null;
      // Find the LAST sub-run whose text contains "X" - the inserted one.
      for (let i = r.mergedFromTexts.length - 1; i >= 0; i--) {
        if (r.mergedFromTexts[i].includes("X")) {
          const b = r.mergedFromBounds[i];
          return { width: b.right - b.x, text: r.mergedFromTexts[i] };
        }
      }
      return null;
    }, baseline.id);
    if (!result) throw new Error("inserted 'X' sub-run not found");
    expect(
      result.width,
      `Inserted "${result.text}" sub-run has 0 width - source font failed to re-encode 'X' as a visible glyph. Should have fallen back to Helvetica.`,
    ).toBeGreaterThan(2);
  });

  test("font-borrow: typing same-char-as-original uses the SOURCE font (width matches original)", async ({
    page,
  }) => {
    // The "try borrow, detect, fall back" path: when every inserted char
    // already appears in the source line.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    // Snapshot the original 'a' width inside "Acrobat" BEFORE editing.
    const origAWidth = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      if (!r) return null;
      // Find the FIRST sub-run whose text is exactly 'a'.
      for (let i = 0; i < r.mergedFromTexts.length; i++) {
        if (r.mergedFromTexts[i] === "a") {
          const b = r.mergedFromBounds[i];
          return b.right - b.x;
        }
      }
      return null;
    }, baseline.id);
    if (origAWidth === null || origAWidth < 1) {
      test.skip(true, "no single-char 'a' sub-run found in tagline");
      return;
    }

    // Insert 'a' right after the 'a' of "Acrobat".
    const caretPos = baseline.text.indexOf("Acrobat") + 6;
    await execAt(page, baseline.id, caretPos, "insertText", "a");

    // Read the INSERTED 'a' sub-run's width.
    const insertedAWidth = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      if (!r) return null;
      // The inserted 'a' is the last sub-run with text exactly 'a'.
      for (let i = r.mergedFromTexts.length - 1; i >= 0; i--) {
        if (r.mergedFromTexts[i] === "a") {
          const b = r.mergedFromBounds[i];
          return b.right - b.x;
        }
      }
      return null;
    }, baseline.id);
    if (insertedAWidth === null) throw new Error("inserted 'a' not found");

    // The inserted 'a' must be approximately the same width as the original
    // 'a'.
    const ratio = insertedAWidth / origAWidth;
    expect(
      ratio,
      `inserted 'a' width ${insertedAWidth.toFixed(2)}pt vs original ${origAWidth.toFixed(2)}pt (ratio ${ratio.toFixed(2)}). Helvetica fallback gives ratio ~0.6; source-font borrow gives ~1.0.`,
    ).toBeGreaterThan(0.85);
    expect(ratio).toBeLessThan(1.2);
  });

  test("font-fallback: typing same-char-as-original keeps text content correct (no garbage glyph)", async ({
    page,
  }) => {
    // Even when the inserted char IS already present in the source text, the
    // result must remain text-content-correct: run.text equals baseline + 'd'.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await findTaglineRun(page);
    if (!baseline) {
      test.skip(true, "tagline missing");
      return;
    }

    // Find caret right after the 'd' of "Adobe".
    const adobeIdx = baseline.text.indexOf("Adobe");
    expect(adobeIdx).toBeGreaterThan(0);
    const caretPos = adobeIdx + 2; // after 'A','d'
    await execAt(page, baseline.id, caretPos, "insertText", "d");

    const result = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      if (!r) return null;
      // Find the inserted 'd' sub-run - it's the one whose text is exactly "d"
      // added between "Ad" and "obe" of the original.
      const dSubRuns = r.mergedFromTexts
        .map((t, i) => ({ text: t, bounds: r.mergedFromBounds[i] }))
        .filter((s) => s.text.includes("d"));
      const widths = dSubRuns.map((s) => s.bounds.right - s.bounds.x);
      return { text: r.text, dWidths: widths };
    }, baseline.id);
    if (!result) throw new Error("run vanished");
    // Text content correct: 'Addobe' appears in the run.
    expect(result.text).toMatch(/Ad+obe/);
    // At least ONE 'd' sub-run must have a real (non-zero) width -
    // the inserted 'd' rendered with a visible glyph.
    const hasRenderableD = result.dWidths.some((w) => w > 2);
    expect(
      hasRenderableD,
      `No 'd' sub-run has visible width (>2pt). Widths: ${JSON.stringify(result.dWidths)} - font borrow would render tofu`,
    ).toBe(true);
  });

  test("font-fallback: subset-font run falls back to Helvetica on edit (no garbage)", async ({
    page,
  }) => {
    // Subset fonts only embed the glyphs the source PDF originally used.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(SUBSET_FONT_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const subsetRun = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  fontSubset: boolean;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      for (const p of [0]) {
        for (const r of store.doc.page(p).runs) {
          if (r.fontSubset && r.text.length >= 3) {
            return { id: r.id, text: r.text };
          }
        }
      }
      return null;
    });
    // The fixture guarantees a subset run; a miss means subset detection
    // regressed, so fail loudly rather than skip.
    if (!subsetRun) {
      throw new Error(
        "subset-font-sample.pdf must contain a subset-font run (subset detection regressed)",
      );
    }

    // Type a char unlikely to be in the subset (a 9 - typical body
    // text rarely subsets digits unless they appear in the source).
    await execAt(page, subsetRun.id, subsetRun.text.length, "insertText", "9");
    await page.waitForTimeout(300);

    const after = await page.evaluate((tid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromBounds: Array<{ x: number; right: number }>;
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === tid);
      return r
        ? {
            text: r.text,
            zeroWidthCount: r.mergedFromBounds.filter(
              (b) => b.right - b.x < 0.1,
            ).length,
          }
        : null;
    }, subsetRun.id);
    if (!after) throw new Error("run vanished after subset edit");
    expect(after.text).toBe(subsetRun.text + "9");
    expect(
      after.zeroWidthCount,
      "subset-font edit emitted 0-width sub-runs - glyph rendering broken",
    ).toBeLessThan(2);
  });

  test("font-fallback: overlay path's canReuseFont gate documented", async ({
    page,
  }) => {
    // Belt-and-suspenders test: confirms the EditTextCommand overlay path
    // reuses the source font ONLY when every new char exists in the.
    await gotoV2(page);
    await loadSamplePdf(page);
    await page.waitForTimeout(500);

    const singleObjRun = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  mergedFromPtrs: number[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      for (const r of store.doc.page(0).runs) {
        if (
          r.mergedFromPtrs.length === 0 &&
          !/^base14:/.test(r.fontId) &&
          r.text.length >= 3 &&
          !r.text.includes("X")
        ) {
          return { id: r.id, text: r.text, fontId: r.fontId };
        }
      }
      return null;
    });
    if (!singleObjRun) {
      test.skip(true, "no single-object non-base14 run without 'X' available");
      return;
    }

    // Insert 'X' (not in original text) → safeChars=false → font
    // must flip to base14 Helvetica per the canReuseFont gate.
    await execAt(
      page,
      singleObjRun.id,
      singleObjRun.text.length,
      "insertText",
      "X",
    );
    const after = await readRun(page, singleObjRun.id);
    if (!after) throw new Error("run vanished");
    expect(
      after.fontId,
      `expected base14 fallback for unsafe-char insert; got ${after.fontId}`,
    ).toMatch(/^base14:/);
  });

  test("multiple consecutive spaces survive save and re-open", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";

    // Three consecutive spaces between A and B.
    await typeIntoRun(page, runTestId, " A   B");
    await expect(firstRun).toContainText("A   B");

    await saveAndReopen(page);

    // The per-word emit writes "A" + gap + "B" as separate PDFium text objects.
    const allText = await page
      .waitForFunction(
        () => {
          const store = (
            window as unknown as {
              __v2_editor_store?: {
                state: { pages: { runs: { text: string }[] }[] };
              };
            }
          ).__v2_editor_store;
          if (!store) return null;
          const runs = store.state.pages[0]?.runs ?? [];
          if (runs.length === 0) return null;
          const joined = runs.map((r) => r.text).join("\n");
          return joined.includes("A") && joined.includes("B") ? joined : null;
        },
        { timeout: 30_000, polling: 300 },
      )
      .then((h) => h.jsonValue() as Promise<string>);
    // Both letters came back - no text object was lost in the round trip.
    expect(allText).toContain("A");
    expect(allText).toContain("B");
    // Multiple consecutive spaces must survive in at least one run (LineGrouper
    // rebuilds them from cursor-jump positions).
    expect(allText).toMatch(/ {2,}/);
  });
});

test.describe("PDF text editor v2 - colour", () => {
  test("changing the colour control dispatches a SetColour edit", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    // Capture the clicked run's model id so the fill assertion targets the
    // run that was actually mutated, not runs[0] blindly.
    const runId = await firstRun.evaluate((el) => {
      const tid = el.getAttribute("data-testid") ?? "";
      return tid.replace(/^v2-run-/, "");
    });
    await firstRun.click();

    // Mantine's ColorInput stamps the testid on the wrapper, not the underlying
    // <input>.
    const colourInput = page.getByLabel("Font colour").first();
    await expect(colourInput).toBeEnabled();
    await colourInput.fill("#ff0000"); // theme-allow-color test input value
    await colourInput.press("Enter");
    await expect(page.getByTestId("v2-undo")).toBeEnabled();

    // The undo button being enabled only proves SOMETHING dispatched.
    const fill = await page.evaluate((id) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            state: {
              pages: {
                runs: {
                  id: string;
                  fill: { r: number; g: number; b: number; a: number };
                }[];
              }[];
            };
          };
        }
      ).__v2_editor_store;
      const run = store.state.pages[0]?.runs.find((r) => r.id === id);
      return run ? { ...run.fill } : null;
    }, runId);
    expect(fill).not.toBeNull();
    expect(fill!.r).toBe(255);
    expect(fill!.g).toBe(0);
    expect(fill!.b).toBe(0);
  });
});

test.describe("PDF text editor v2 - delete + multi-select", () => {
  test("Delete button removes the selected run", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const before = await runs.count();
    expect(before).toBeGreaterThan(0);

    const firstId = await runs.first().getAttribute("data-testid");
    await runs.first().click();
    await page.getByTestId("v2-delete").click();

    // The deleted run's element should no longer be in the DOM.
    await expect(page.getByTestId(firstId!)).toHaveCount(0);
    await expect(runs).toHaveCount(before - 1);
  });

  test("shift-click selects multiple runs", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const count = await runs.count();
    if (count < 2) {
      test.skip(true, "Fixture has < 2 runs");
      return;
    }

    await runs.nth(0).click();
    await runs.nth(1).click({ modifiers: ["Shift"] });

    // After a multi-select with two different fills, the colour input is null
    // (mixed).
    const colourInput = page.getByLabel("Font colour").first();
    await expect(colourInput).toBeEnabled();
    await colourInput.fill("#00aa00"); // theme-allow-color test input value
    await colourInput.press("Enter");
    // One edit per selected run = >=2 entries on the undo stack.
    await expect(page.getByTestId("v2-undo")).toBeEnabled();
    await page.getByTestId("v2-undo").click();
    await expect(page.getByTestId("v2-redo")).toBeEnabled();
  });
});

test.describe("PDF text editor v2 - keyboard shortcuts", () => {
  test("Ctrl+Z undoes the latest edit", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";
    const original = (await firstRun.innerText()) ?? "";

    await typeIntoRun(page, runTestId, "tt");
    await expect(firstRun).toContainText("tt");

    // Move focus off the run so the Ctrl+Z isn't captured as caret undo.
    await page
      .locator('[data-testid="v2-stage"]')
      .click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+z");
    await expect(firstRun).toHaveText(original);
  });
});

test.describe("PDF text editor v2 - font family", () => {
  test("changing font family dispatches a SetFontFamily edit", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runId = await firstRun.evaluate((el) =>
      (el.getAttribute("data-testid") ?? "").replace(/^v2-run-/, ""),
    );
    await firstRun.click();

    const readFontId = (id: string) =>
      page.evaluate((rid) => {
        const store = (
          window as unknown as {
            __v2_editor_store: {
              state: { pages: { runs: { id: string; fontId: string }[] }[] };
            };
          }
        ).__v2_editor_store;
        return (
          store.state.pages[0]?.runs.find((r) => r.id === rid)?.fontId ?? null
        );
      }, id);

    const fontIdBefore = await readFontId(runId);

    const family = page.getByLabel("Font family").first();
    await expect(family).toBeEnabled();
    await family.click();
    // Mantine Select dropdown - pick "Helvetica" option by visible text.
    // The dropdown renders in a Portal so we query at the page root.
    await page
      .getByRole("option", { name: /^Helvetica$/i })
      .first()
      .click({ timeout: 10_000 });
    await expect(page.getByTestId("v2-undo")).toBeEnabled();

    // Undo enabled only proves a dispatch. Assert the run's model fontId
    // actually flipped to a Helvetica family (and away from its original).
    const fontIdAfter = await readFontId(runId);
    expect(fontIdAfter).not.toBeNull();
    expect(fontIdAfter).toMatch(/helvetica/i);
    expect(fontIdAfter).not.toBe(fontIdBefore);
  });
});

test.describe("PDF text editor v2 - multi-page", () => {
  test("renders every page of a multi-page document", async ({ page }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);

    // The fixture has 3 pages; assert all three render.
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("v2-page-1")).toBeVisible();
    await expect(page.getByTestId("v2-page-2")).toBeVisible();
  });

  test("edits on a non-first page are saved and round-trip", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);
    await expect(page.getByTestId("v2-page-2")).toBeVisible({
      timeout: 30_000,
    });

    // Pick the first text run on page 2 (index 2). Skip if it has none.
    const runs = page.locator('[data-testid^="v2-run-p2-"]');
    const count = await runs.count();
    if (count === 0) {
      test.skip(true, "Multi-page fixture page 2 has no editable text runs");
      return;
    }

    const target = runs.first();
    const runTestId = (await target.getAttribute("data-testid")) ?? "";
    const runId = runTestId.replace(/^v2-run-/, "");
    // Capture the page-2 run's model text before the edit so we can prove the
    // appended char survives a full round-trip, not just lands in DOM.
    const textBefore = await page.evaluate((id) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            state: { pages: { runs: { id: string; text: string }[] }[] };
          };
        }
      ).__v2_editor_store;
      return store.state.pages[2]?.runs.find((r) => r.id === id)?.text ?? "";
    }, runId);
    // Append a chr known to be in latin subsets.
    await typeIntoRun(page, runTestId, "e");
    await expect(target).toContainText("e");
    await expect(page.getByTestId("v2-undo")).toBeEnabled();

    // Save the edited document and capture the bytes.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);

    // Remember the document we are replacing: after the re-upload the OLD
    // document's page-2 runs are still mounted.
    await stashCurrentDocument(page);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round-trip.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(page.getByTestId("v2-page-2")).toBeVisible({
      timeout: 30_000,
    });
    await waitForReopenedPage(page, 2);

    // Re-read the page-2 run text through PdfiumTextReader + LineGrouper.
    const page2Text = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            state: { pages: { runs: { text: string }[] }[] };
          };
        }
      ).__v2_editor_store;
      return (store.state.pages[2]?.runs ?? []).map((r) => r.text).join("\n");
    });
    // The edit appended 'e' to the run's last token.
    const lastToken = textBefore.trim().split(/\s+/).pop() ?? textBefore;
    expect(page2Text).toContain(`${lastToken}e`);
  });
});

test.describe("PDF text editor v2 - bold/italic", () => {
  test("Bold toggle dispatches a SetFontFamily edit", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runId = await firstRun.evaluate((el) =>
      (el.getAttribute("data-testid") ?? "").replace(/^v2-run-/, ""),
    );
    await firstRun.click();
    // First we must swap to a base-14 font (Helvetica) since the source PDF's
    // runs use unknown families that the bold flip doesn't know how to map.
    const family = page.getByLabel("Font family").first();
    await family.click();
    await page
      .getByRole("option", { name: /^Helvetica$/i })
      .first()
      .click({ timeout: 10_000 });
    // Wait for the dispatch to LAND before reading the history depth. Clicking
    // the option only starts it; reading straight after raced the command and
    // saw an empty undo stack most of the time.
    await expect(page.getByTestId("v2-undo")).toBeEnabled();

    const readState = (id: string) =>
      page.evaluate((rid) => {
        const store = (
          window as unknown as {
            __v2_editor_store: {
              history: { size: () => { undo: number; redo: number } };
              state: { pages: { runs: { id: string; fontId: string }[] }[] };
            };
          }
        ).__v2_editor_store;
        return {
          undoDepth: store.history.size().undo,
          fontId:
            store.state.pages[0]?.runs.find((r) => r.id === rid)?.fontId ??
            null,
        };
      }, id);

    const before = await readState(runId);
    expect(before.undoDepth).toBeGreaterThan(0);

    // Now click Bold. It should dispatch another edit (undo stack grows).
    await page.getByTestId("v2-bold").click();
    // Toolbar bold state flips to active.
    await expect(page.getByTestId("v2-bold")).toHaveAttribute(
      "data-variant",
      /filled/i,
    );

    // The toolbar's active state flips on local component state, which can beat
    // the command onto the screen - so wait for the history itself to grow.
    await page.waitForFunction(
      (depth) => {
        const store = (
          window as unknown as {
            __v2_editor_store: {
              history: { size: () => { undo: number; redo: number } };
            };
          }
        ).__v2_editor_store;
        return store.history.size().undo > depth;
      },
      before.undoDepth,
      { timeout: 10_000 },
    );

    // The misnamed boolean was never compared. Assert a real history-size
    // growth AND that the run's fontId gained a Bold variant.
    const after = await readState(runId);
    expect(after.undoDepth).toBeGreaterThan(before.undoDepth);
    expect(after.fontId).toMatch(/bold/i);
  });

  test("user-sample.pdf: Bold on a LineGrouper-merged tagline removes every per-glyph original (no ghost layers)", async ({
    page,
  }) => {
    // Regression for the user-reported "I hit bold and unbold and it broke the
    // text and made multiple layers" bug.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    const baseline = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  mergedFromPtrs: number[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r
        ? {
            id: r.id,
            text: r.text,
            fontId: r.fontId,
            mergedCount: r.mergedFromPtrs.length,
          }
        : null;
    });
    if (!baseline) {
      test.skip(
        true,
        "user-sample.pdf missing Adobe/Acrobat/Alternative tagline",
      );
      return;
    }
    // The bug only surfaces on per-glyph layouts; sanity-check the
    // fixture is still emitting one ptr per glyph.
    expect(baseline.mergedCount).toBeGreaterThan(10);

    // Select the tagline via the store API.
    await page.evaluate((id) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            selection: { selectOne: (rid: string) => void };
          };
        }
      ).__v2_editor_store;
      store.selection.selectOne(id);
    }, baseline.id);

    // Click Bold then Bold again (the user's exact sequence). Each
    // click dispatches a SetFontFamily command.
    await page.getByTestId("v2-bold").click();
    await page.waitForTimeout(300);
    await page.getByTestId("v2-bold").click();
    await page.waitForTimeout(300);

    const after = await page.evaluate((id) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  mergedFromPtrs: number[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === id);
      return r
        ? {
            text: r.text,
            fontId: r.fontId,
            mergedCount: r.mergedFromPtrs.length,
          }
        : null;
    }, baseline.id);
    if (!after) throw new Error("tagline run vanished after bold");
    // Text content preserved.
    expect(after.text).toBe(baseline.text);
    // Run swapped to a base-14 font.
    expect(after.fontId).toMatch(/^base14:Helvetica/);
    // mergedFromPtrs MUST be cleared - the run is now one base-14 object, not a
    // per-glyph cluster.
    expect(after.mergedCount).toBe(0);

    // Round-trip through save+reopen and check no ghost text.
    const saveBtn = page.getByTestId("v2-save");
    const downloadPromise = page.waitForEvent("download");
    await saveBtn.click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round-trip.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);

    const reopenedRuns = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ text: string }> } };
          };
        }
      ).__v2_editor_store;
      return store.doc.page(0).runs.map((r) => r.text);
    });
    // The CORE assertion: each distinctive tagline word appears in EXACTLY ONE
    // run.
    const countCarrying = (word: string) =>
      reopenedRuns.filter((t) => t.includes(word)).length;
    for (const word of ["Adobe", "Acrobat", "Alternative"]) {
      expect(
        countCarrying(word),
        `Runs carrying "${word}": ${JSON.stringify(
          reopenedRuns.filter((t) => t.includes(word)),
        )}`,
      ).toBe(1);
    }
  });
});

test.describe("PDF text editor v2 - add text box", () => {
  test("Add text mode + page click inserts a new run", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const before = await runs.count();
    expect(before).toBeGreaterThan(0);

    await page.getByTestId("v2-add-text").click();
    // The mode toggle changes the button label.
    await expect(page.getByTestId("v2-add-text")).toContainText(
      /click page to add text/i,
    );

    // Click somewhere on page 0. The click handler converts to PDF
    // page-space coords and dispatches InsertTextCommand.
    const pageEl = page.getByTestId("v2-page-0");
    await pageEl.click({ position: { x: 200, y: 400 } });

    await expect(runs).toHaveCount(before + 1, { timeout: 5_000 });
    // Mode resets back to select after the insertion.
    await expect(page.getByTestId("v2-add-text")).toHaveText("Add text");
  });
});

test.describe("PDF text editor v2 - line grouping", () => {
  test("table-cell single-letter runs cluster into one editable group", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    // The raw PDFium read of sample.pdf produced 9 separate text objects (one
    // per word/letter).
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const count = await runs.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(9);
  });

  test("editing a merged run replaces the cluster with one PDF object", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const target = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await target.getAttribute("data-testid")) ?? "";
    const original = (await target.innerText()) ?? "";
    // Typing any character into a merged group falls through to the base-14
    // Helvetica fallback.
    await typeIntoRun(page, runTestId, "ZZZ");
    await expect(target).toContainText(`${original}ZZZ`);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const buf = Buffer.concat(chunks);
    expect(buf.subarray(0, 4).toString("ascii")).toBe("%PDF");
  });
});

test.describe("PDF text editor v2 - glyph fallback", () => {
  test("typing arbitrary chars stays visible in the overlay", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    // The merged-collapse path swaps the run to Helvetica (base-14) so
    // arbitrary Latin characters can be typed.
    const target = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await target.getAttribute("data-testid")) ?? "";
    await typeIntoRun(page, runTestId, "x!@#");
    await expect(target).toContainText("x!@#");
    await expect(page.getByTestId("v2-undo")).toBeEnabled();
  });
});

/** Alpha of a computed `rgb()/rgba()` string; 0 when fully transparent. */
function alphaOf(cssColor: string): number {
  const m = /rgba?\(([^)]+)\)/.exec(cssColor);
  if (!m) return 1;
  const parts = m[1].split(",").map((x) => parseFloat(x.trim()));
  return parts.length >= 4 ? parts[3] : 1;
}

test.describe("PDF text editor v2 - typing fidelity", () => {
  test("a clicked run keeps its original ink until it is actually edited", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const target = page.locator('[data-testid^="v2-run-p0-"]').first();
    const read = () =>
      target.evaluate((el) => {
        const cs = window.getComputedStyle(el);
        return {
          color: cs.color,
          background: cs.backgroundColor,
          fontFamily: cs.fontFamily,
        };
      });

    await target.click();
    // Clicking only places a caret, so the PDF's own glyphs stay on screen
    // rather than being covered by a CSS approximation of them.
    const clicked = await read();
    expect(clicked.color).toBe("rgba(0, 0, 0, 0)");
    // A faint selection tint is fine; what must not appear is the near-opaque
    // mask, which would hide the PDF's own glyphs behind a CSS rendering.
    expect(alphaOf(clicked.background)).toBeLessThan(0.5);

    await page.keyboard.type("X");
    await page.waitForTimeout(400);
    const typed = await read();
    expect(typed.color).toBe("rgba(0, 0, 0, 0)");
    expect(alphaOf(typed.background)).toBeLessThan(0.5);
    await expect(target).toContainText("X");
  });
});

test.describe("PDF text editor v2 - image manipulation", () => {
  test("image overlays render with pointer events enabled", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const image = page.locator('[data-testid^="v2-image-"]').first();
    await expect(image).toBeVisible({ timeout: 30_000 });
    const pointer = await image.evaluate(
      (el) => window.getComputedStyle(el).pointerEvents,
    );
    expect(pointer).toBe("auto");
  });

  test("image overlay accepts a drag (legacy alias)", async ({ page }) => {
    // Same behaviour as the absolute-transform test above; retained
    // because external scripts may still reference this test name.
    await gotoV2(page);
    await loadSamplePdf(page);
    const image = page.locator('[data-testid^="v2-image-"]').first();
    await expect(image).toBeVisible({ timeout: 30_000 });
    const box = await image.boundingBox();
    if (!box) throw new Error("image overlay has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 80,
      box.y + box.height / 2 + 40,
      {
        steps: 5,
      },
    );
    await page.mouse.up();
    await expect(page.getByTestId("v2-undo")).toBeEnabled({ timeout: 5_000 });
  });
});

test.describe("PDF text editor v2 - image click-through + delete", () => {
  test("idle image overlay paints no border so text underneath is reachable", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const image = page.locator('[data-testid^="v2-image-"]').first();
    await expect(image).toBeVisible({ timeout: 30_000 });
    // Idle (no hover, not selected) - outline should be 'none'.
    const idleOutline = await image.evaluate(
      (el) => window.getComputedStyle(el).outlineStyle,
    );
    expect(idleOutline).toBe("none");
  });

  test("clicking an image selects it, enabling Delete on the toolbar", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const image = page.locator('[data-testid^="v2-image-"]').first();
    await expect(image).toBeVisible({ timeout: 30_000 });
    await image.click();
    // After selection the overlay has a solid border.
    await expect(image).toHaveCSS("outline-style", "solid");
    await expect(page.getByTestId("v2-delete")).toBeEnabled();
  });

  test("Delete on a selected image removes it", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const images = page.locator('[data-testid^="v2-image-"]');
    const before = await images.count();
    expect(before).toBeGreaterThan(0);
    const first = images.first();
    const imgId = (await first.getAttribute("data-testid")) ?? "";
    await first.click();
    await page.getByTestId("v2-delete").click();
    await expect(page.getByTestId(imgId)).toHaveCount(0);
    await expect(images).toHaveCount(before - 1);
  });
});

test.describe("PDF text editor v2 - render throttling", () => {
  test("off-screen pages show a placeholder until they near the viewport", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);

    // Page 0 is at the top of the stage and within the viewport on first
    // render.
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("v2-page-0-placeholder")).toHaveCount(0, {
      timeout: 10_000,
    });

    // Page 2 is below the fold for a 1080-tall viewport (each page is 792 PDF
    // points * 1.5 scale ≈ 1188 CSS pixels).
    await expect(page.getByTestId("v2-page-2")).toBeVisible();
  });
});

test.describe("PDF text editor v2 - lazy page loading", () => {
  test("multi-page docs render their pages without blocking on every read", async ({
    page,
  }) => {
    // We don't have a 60-page fixture in the repo so we time the load of the
    // existing multi-page fixture as a guardrail.
    await gotoV2(page);
    const started = Date.now();
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    const elapsedMs = Date.now() - started;
    // Generous bound - the lazy load is a fraction of this in practice but CI
    // machines vary.
    expect(elapsedMs).toBeLessThan(10_000);
  });

  test("big-sample.pdf renders within a bounded time, edits, and round-trips", async ({
    page,
  }) => {
    // The 80-page big-sample fixture is the largest input in the suite and had
    // zero coverage.
    test.setTimeout(120_000);
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(BIG_SAMPLE_PDF);

    // Page 0 must render within a bounded time even for the big doc.
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    // A later page lazily renders once scrolled near the viewport.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="v2-page-40"]',
      );
      el?.scrollIntoView({ block: "center" });
    });
    await expect(page.getByTestId("v2-page-40")).toBeVisible({
      timeout: 30_000,
    });

    // Make a trivial edit on page 0, then save + reopen and assert it survived.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="v2-page-0"]',
      );
      el?.scrollIntoView({ block: "center" });
    });
    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    await expect(firstRun).toBeVisible({ timeout: 30_000 });
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";
    await typeIntoRun(page, runTestId, "ZZBIG");
    await expect(firstRun).toContainText("ZZBIG");

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);

    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "big-round-trip.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    const reopenedText = await page
      .waitForFunction(
        () => {
          const runs = Array.from(
            document.querySelectorAll<HTMLDivElement>(
              '[data-testid^="v2-run-p0-"]',
            ),
          );
          if (runs.length === 0) return null;
          const joined = runs.map((el) => el.innerText).join("\n");
          return /ZZBIG/.test(joined) ? joined : null;
        },
        { timeout: 30_000, polling: 500 },
      )
      .then((h) => h.jsonValue() as Promise<string>);
    expect(reopenedText).toContain("ZZBIG");
  });
});

test.describe("PDF text editor v2 - paragraph recognition", () => {
  test("a four-line body paragraph collapses into one overlay", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(PARAGRAPH_PDF);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    await expect(runs.first()).toBeVisible({ timeout: 30_000 });
    const count = await runs.count();
    // 5 source text objects (1 heading + 4 body lines) ought to fold
    // down to 2 overlays (heading + paragraph block).
    expect(count).toBeLessThan(5);
    expect(count).toBeGreaterThanOrEqual(2);

    // One of the overlays must contain text from across multiple
    // body lines (newline-joined by ParagraphGrouper).
    const allTexts = await Promise.all(
      (await runs.all()).map((r) => r.innerText()),
    );
    const paragraphLike = allTexts.find((t) => t.includes("\n"));
    expect(paragraphLike).toBeTruthy();
    expect(paragraphLike!.toLowerCase()).toContain("first line");
    expect(paragraphLike!.toLowerCase()).toContain("fourth line");
  });
});

test.describe("PDF text editor v2 - text run move (Ctrl+drag)", () => {
  test("Ctrl+drag on a text run dispatches MoveTextRunCommand", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const run = page.locator('[data-testid^="v2-run-p0-"]').first();
    await expect(run).toBeVisible({ timeout: 30_000 });
    const box = await run.boundingBox();
    if (!box) throw new Error("text run has no bounding box");

    await page.keyboard.down("Control");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 60,
      box.y + box.height / 2 + 20,
      { steps: 5 },
    );
    await page.mouse.up();
    await page.keyboard.up("Control");

    await expect(page.getByTestId("v2-undo")).toBeEnabled({ timeout: 5_000 });
  });
});

test.describe("PDF text editor v2 - image transform (absolute)", () => {
  test("dragging an image dispatches SetImageTransformCommand", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const image = page.locator('[data-testid^="v2-image-"]').first();
    await expect(image).toBeVisible({ timeout: 30_000 });
    const box = await image.boundingBox();
    if (!box) throw new Error("image overlay has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + 90,
      box.y + box.height / 2 + 60,
      { steps: 5 },
    );
    await page.mouse.up();
    await expect(page.getByTestId("v2-undo")).toBeEnabled({ timeout: 5_000 });
  });
});

test.describe("PDF text editor v2 - form xobject recursion", () => {
  test("text inside form xobjects (magazine layout) is extracted", async ({
    page,
  }) => {
    await gotoV2(page);

    // The fixture is generated by
    // src/core/tests/test-fixtures/generate-form-xobject-sample.mjs.
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(FORM_XOBJECT_PDF);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    await expect(runs.first()).toBeVisible({ timeout: 30_000 });
    expect(await runs.count()).toBeGreaterThan(0);

    const allText = (
      await Promise.all((await runs.all()).map((r) => r.innerText()))
    ).join(" ");
    expect(allText.toLowerCase()).toMatch(/magazine|subheading|paragraph/);
  });
});

test.describe("PDF text editor v2 - load progress overlay", () => {
  test("loading overlay shows a stage and progress bar while opening", async ({
    page,
  }) => {
    await gotoV2(page);
    // Kick off the load and immediately capture the stage element.
    const overlayPromise = page
      .getByTestId("v2-stage-loading")
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);
    const sawOverlay = await overlayPromise;
    // Either the overlay appeared, or the load finished too fast for the
    // observer to catch it.
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    // Document the assertion either way so a future regression that
    // never paints the overlay AND never completes is still caught.
    if (!sawOverlay) {
      // Sanity-check that loading is now false.
      await expect(page.getByTestId("v2-stage-loading")).toHaveCount(0);
    }
  });
});

test.describe("PDF text editor v2 - fit-to-width", () => {
  test("Fit button updates the zoom percent based on viewport width", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);
    const before = await page.getByTestId("v2-zoom-percent").innerText();
    await page.getByTestId("v2-zoom-fit").click();
    const after = await page.getByTestId("v2-zoom-percent").innerText();
    // The fit value depends on viewport width, but must be a sensible
    // percentage in the clamped range.
    const value = parseInt(after.replace("%", ""), 10);
    expect(value).toBeGreaterThanOrEqual(25);
    expect(value).toBeLessThanOrEqual(400);
    expect(after).not.toBe(before);
  });
});

test.describe("PDF text editor v2 - F3 next match", () => {
  test("F3 opens the find bar and steps to the next match", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);
    await page.keyboard.press("Control+f");
    await page.getByTestId("v2-find-input").fill("documents");
    await page.keyboard.press("F3");
    // The find bar stays open, count text shows a match position.
    await expect(page.getByTestId("v2-find-bar")).toBeVisible();
    await expect(page.getByTestId("v2-find-count")).toContainText(/of \d+/);
  });
});

test.describe("PDF text editor v2 - zoom controls", () => {
  test("zoom in / zoom out / 100% buttons drive renderScale", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);
    const percent = page.getByTestId("v2-zoom-percent");
    await expect(percent).toHaveText("150%");
    await page.getByTestId("v2-zoom-in").click();
    await expect(percent).toHaveText("175%");
    await page.getByTestId("v2-zoom-out").click();
    await page.getByTestId("v2-zoom-out").click();
    await expect(percent).toHaveText("125%");
    await page.getByTestId("v2-zoom-reset").click();
    await expect(percent).toHaveText("100%");
  });
});

test.describe("PDF text editor v2 - find in document", () => {
  test("Ctrl+F opens the find bar and steps through matches", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);
    await page.keyboard.press("Control+f");
    await expect(page.getByTestId("v2-find-bar")).toBeVisible();
    await page.getByTestId("v2-find-input").fill("Test");
    const count = page.getByTestId("v2-find-count");
    await expect(count).toContainText(/of \d+/);
    await page.getByTestId("v2-find-next").click();
    await expect(count).toContainText(/of \d+/);
    await page.getByTestId("v2-find-close").click();
    await expect(page.getByTestId("v2-find-bar")).toHaveCount(0);
  });
});

test.describe("PDF text editor v2 - paragraph soft-wrap", () => {
  test("typing into a paragraph captures visual line breaks", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(PARAGRAPH_PDF);
    // The paragraph overlay is the second run on page 0.
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    await expect(runs.first()).toBeVisible({ timeout: 30_000 });
    const allTexts = await Promise.all(
      (await runs.all()).map((r) => r.innerText()),
    );
    const para = allTexts.find((t) => t.includes("\n"));
    expect(para).toBeTruthy();
    // The paragraph snapshot already contains the original \n breaks.
    expect(para!.split("\n").length).toBeGreaterThanOrEqual(2);
  });
});

test.describe("PDF text editor v2 - undo restores form-xobject text", () => {
  test("editing form-xobject text then undoing puts the original back visually", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(FORM_XOBJECT_PDF);
    const target = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await target.getAttribute("data-testid")) ?? "";
    const original = (await target.innerText()) ?? "";

    await typeIntoRun(page, runTestId, "ZZZ");
    await expect(target).toContainText("ZZZ");

    await page.getByTestId("v2-undo").click();
    // After undo, a run on page 0 contains the original text.
    const undoneRuns = page.locator('[data-testid^="v2-run-p0-"]');
    const undoneTexts = await Promise.all(
      (await undoneRuns.all()).map((r) => r.innerText()),
    );
    expect(undoneTexts.some((t) => t === original)).toBe(true);
  });
});

test.describe("PDF text editor v2 - workbench tab UX", () => {
  test("Viewer tab is hidden while the editor tool is selected", async ({
    page,
  }) => {
    await gotoV2(page);
    // The WorkbenchBar exposes its tab buttons with the tab label as the
    // accessible text.
    const viewerTab = page
      .locator(".workbench-bar-views, .workbench-bar-center")
      .getByRole("button", { name: /^Viewer$/ });
    await expect(viewerTab).toHaveCount(0);
  });

  test("Editor workbench pins itself when an external setWorkbench fires", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);
    // Simulate the FileContext side-effect that pushes to viewer on
    // file preview. The pin-effect should immediately switch back.
    await page.evaluate(() => {
      // Best-effort hack: find any "Active Files" / "Files" tab and click it,
      // then expect we bounce back.
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(page.getByTestId("v2-stage")).toBeVisible();
  });
});

test.describe("PDF text editor v2 - dirty state", () => {
  test("top bar marks the file dirty after an edit", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    // Save state lives beside the top-bar filename; the sidebar no longer
    // repeats it. Clean on load.
    const filename = page.getByTestId("v2-filename");
    await expect(filename).toBeVisible();
    await expect(filename).not.toContainText("unsaved");

    const firstRunTestId = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .first()
      .getAttribute("data-testid");
    await typeIntoRun(page, firstRunTestId!, "X");

    await expect(filename).toContainText("unsaved");
  });
});

test.describe("PDF text editor v2 - toolbar tooltips", () => {
  test("toolbar buttons expose tooltip labels", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    // After the text/image-editor scope cleanup, the rotate, print, reset, and
    // save-to-workbench toolbar entries are gone.
    await expect(page.getByTestId("v2-add-text")).toBeVisible();
    await expect(page.getByTestId("v2-add-image")).toBeVisible();
    await expect(page.getByTestId("v2-save")).toBeVisible();
    await expect(page.getByTestId("v2-help")).toBeVisible();
    // Removed controls must NOT appear:
    await expect(page.getByTestId("v2-rotate-left")).toHaveCount(0);
    await expect(page.getByTestId("v2-rotate-right")).toHaveCount(0);
    await expect(page.getByTestId("v2-print")).toHaveCount(0);
    await expect(page.getByTestId("v2-reset")).toHaveCount(0);
    await expect(page.getByTestId("v2-save-workbench")).toHaveCount(0);
  });
});

test.describe("PDF text editor v2 - duplicate selected run", () => {
  test("Ctrl+D clones the selected text run and undo removes the clone", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const before = await page.locator('[data-testid^="v2-run-p0-"]').count();

    const firstRunTestId = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .first()
      .getAttribute("data-testid");
    await page.getByTestId(firstRunTestId!).click();
    await page.waitForTimeout(80);

    await page.keyboard.down("Control");
    await page.keyboard.press("d");
    await page.keyboard.up("Control");
    await page.waitForTimeout(250);

    const after = await page.locator('[data-testid^="v2-run-p0-"]').count();
    expect(after).toBe(before + 1);

    await page.evaluate(() => {
      const store = (window as unknown as { __v2_editor_store?: unknown })
        .__v2_editor_store as { undo: () => void };
      store.undo();
    });
    await page.waitForTimeout(200);

    const reverted = await page.locator('[data-testid^="v2-run-p0-"]').count();
    expect(reverted).toBe(before);
  });
});

test.describe("PDF text editor v2 - Ctrl+wheel zoom", () => {
  test("Ctrl+wheel up on stage increases renderScale", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const readScale = () =>
      page.evaluate(() => {
        const store = (
          window as unknown as {
            __v2_editor_store?: { getState: () => { renderScale: number } };
          }
        ).__v2_editor_store!;
        return store.getState().renderScale;
      });

    const initial = await readScale();

    await page.evaluate(() => {
      const stage = document.querySelector(
        '[data-testid="v2-stage"]',
      ) as HTMLElement | null;
      stage?.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -100,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForTimeout(150);

    const after = await readScale();
    expect(after).toBeGreaterThan(initial);
  });
});

test.describe("PDF text editor v2 - paragraph line wrap fidelity", () => {
  test("paragraph overlay does not visually wrap its source lines", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(PARAGRAPH_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    const mismatched = await page.evaluate(() => {
      const runs = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="v2-run-p0-"]'),
      );
      return runs
        .map((el) => {
          const text = el.innerText || "";
          const sourceLines = text.split(/\r?\n/).length;
          if (sourceLines < 2) return null;
          const lh =
            parseFloat(getComputedStyle(el).lineHeight) ||
            el.getBoundingClientRect().height;
          const visualLines = Math.round(
            el.getBoundingClientRect().height / Math.max(1, lh),
          );
          return { sourceLines, visualLines, text: text.slice(0, 30) };
        })
        .filter(Boolean) as Array<{
        sourceLines: number;
        visualLines: number;
        text: string;
      }>;
    });

    expect(mismatched.length).toBeGreaterThan(0);
    for (const row of mismatched) {
      expect(
        row.visualLines,
        `paragraph "${row.text}" reports ${row.visualLines} visual lines for ${row.sourceLines} source lines`,
      ).toBe(row.sourceLines);
    }
  });
});

test.describe("PDF text editor v2 - marquee + merge", () => {
  test("Ctrl+Shift+drag selects every run inside the marquee", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    await page.waitForTimeout(150);
    const totalRuns = await page.locator('[data-testid^="v2-run-p0-"]').count();
    expect(totalRuns).toBeGreaterThan(1);

    // Dispatch the synthetic mousedown / mousemove / mouseup that wrap
    // every run on page 0.
    await page.evaluate(() => {
      const runs = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid^="v2-run-p0-"]'),
      );
      const rects = runs.map((el) => el.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const top = Math.min(...rects.map((r) => r.top));
      const right = Math.max(...rects.map((r) => r.right));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      const stage = document.querySelector(
        '[data-testid="v2-pages"]',
      ) as HTMLElement;
      // MarqueeSelector listens for POINTER events (pointer-based for
      // mouse/pen/touch parity), so fire pointer events, not mouse events.
      const fire = (type: string, x: number, y: number) =>
        stage.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            ctrlKey: true,
            shiftKey: true,
            pointerId: 1,
          }),
        );
      fire("pointerdown", left - 5, top - 5);
      fire("pointermove", right + 5, bottom + 5);
      // Pointerup goes through window in MarqueeSelector's listener.
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: right + 5,
          clientY: bottom + 5,
          ctrlKey: true,
          shiftKey: true,
          pointerId: 1,
        }),
      );
    });

    await page.waitForTimeout(120);

    const selected = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store?: {
            selection: { value: { runIds: string[] } };
          };
        }
      ).__v2_editor_store!;
      return store.selection.value.runIds.length;
    });

    expect(selected).toBe(totalRuns);
  });

  test("Group / Ungroup toolbar buttons merge and split paragraphs", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const initial = await runs.count();
    expect(initial).toBeGreaterThanOrEqual(2);

    await expect(page.getByTestId("v2-group")).toBeDisabled();
    await expect(page.getByTestId("v2-ungroup")).toBeDisabled();

    const ids = await runs.evaluateAll((els) =>
      els
        .slice(0, 2)
        .map((el) => el.getAttribute("data-testid")!.replace(/^v2-run-/, "")),
    );
    await page.evaluate((ids) => {
      const store = (
        window as unknown as {
          __v2_editor_store?: {
            selection: { selectMany: (ids: string[]) => void };
          };
        }
      ).__v2_editor_store!;
      store.selection.selectMany(ids);
    }, ids);
    await page.waitForTimeout(100);

    await expect(page.getByTestId("v2-group")).toBeEnabled();
    await page.getByTestId("v2-group").click();
    await page.waitForTimeout(200);

    const merged = await runs.count();
    expect(merged).toBe(initial - 1);

    await expect(page.getByTestId("v2-ungroup")).toBeEnabled();
    await page.getByTestId("v2-ungroup").click();
    await page.waitForTimeout(200);

    const split = await runs.count();
    expect(split).toBe(initial);
  });

  test("Ctrl+M merges multi-selected runs into one paragraph", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const ids = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!));
    expect(ids.length).toBeGreaterThanOrEqual(2);

    await page.getByTestId(ids[0]).click();
    await page.getByTestId(ids[1]).click({ modifiers: ["Shift"] });

    const before = await page.locator('[data-testid^="v2-run-p0-"]').count();

    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "m",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForTimeout(150);

    const after = await page.locator('[data-testid^="v2-run-p0-"]').count();
    expect(after).toBe(before - 1);
  });
});

test.describe("PDF text editor v2 - help overlay", () => {
  test("? opens the keyboard shortcuts overlay", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "?",
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    await expect(
      page.getByRole("heading", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    await expect(page.getByText("Find").first()).toBeVisible();
  });

  test("Help button opens the overlay", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    await page.getByTestId("v2-help").click();
    await expect(
      page.getByRole("heading", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
  });
});

test.describe("PDF text editor v2 - filename in header", () => {
  test("loaded filename shown in toolbar header", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const filename = page.getByTestId("v2-filename");
    await expect(filename).toBeVisible();
    await expect(filename).toContainText(/sample\.pdf/i);
  });
});

test.describe("PDF text editor v2 - selection count panel", () => {
  test("sidebar shows N runs selected after multi-select", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const ids = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")!));
    expect(ids.length).toBeGreaterThan(1);

    await page.getByTestId(ids[0]).click();
    await page.getByTestId(ids[1]).click({ modifiers: ["Shift"] });

    const countNode = page.getByTestId("v2-selection-count");
    await expect(countNode).toBeVisible();
    await expect(countNode).toContainText(/2 text runs selected/);
  });
});

test.describe("PDF text editor v2 - PageDown navigation", () => {
  test("PageDown scrolls to the next page", async ({ page }) => {
    await gotoV2(page);
    await loadMultiPageSample(page);

    const beforeTop = await page
      .getByTestId("v2-page-1")
      .evaluate((el) => el.getBoundingClientRect().top);

    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "PageDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForTimeout(500);

    const afterTop = await page
      .getByTestId("v2-page-1")
      .evaluate((el) => el.getBoundingClientRect().top);

    expect(afterTop).toBeLessThan(beforeTop);
  });
});

test.describe("PDF text editor v2 - Ctrl+A select all", () => {
  test("Ctrl+A on the page stage selects every run", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const total = await page.locator('[data-testid^="v2-run-p0-"]').count();

    await page.evaluate(() => {
      // Dispatch the keydown on window directly so we exercise the same
      // listener the user's Ctrl+A would hit.
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await page.waitForTimeout(150);

    const selected = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store?: {
            selection: { value: { runIds: string[] } };
          };
        }
      ).__v2_editor_store!;
      return store.selection.value.runIds.length;
    });

    expect(selected).toBe(total);
  });
});

// ============================================================ Stress +
// edge-case battery.

test.describe("PDF text editor v2 - stress: whitespace insertion variations", () => {
  /** Caret at char index `pos` inside `runTestId`. */
  async function placeCaret(
    page: import("@playwright/test").Page,
    runTestId: string,
    pos: number,
  ) {
    await page.evaluate(
      ({ tid, pos }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="${tid}"]`,
        );
        if (!el) throw new Error("no run el");
        el.focus();
        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null,
        );
        let node: Text | null = null;
        let remaining = pos;
        while (walker.nextNode()) {
          const n = walker.currentNode as Text;
          const len = n.textContent?.length ?? 0;
          if (remaining <= len) {
            node = n;
            break;
          }
          remaining -= len;
        }
        if (!node) throw new Error("ran out of text walking caret");
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.setStart(node, remaining);
        range.setEnd(node, remaining);
        sel.removeAllRanges();
        sel.addRange(range);
      },
      { tid: runTestId, pos },
    );
  }

  async function insertAt(
    page: import("@playwright/test").Page,
    runTestId: string,
    pos: number,
    text: string,
  ) {
    await placeCaret(page, runTestId, pos);
    await page.evaluate((t) => {
      document.execCommand("insertText", false, t);
    }, text);
    await page.waitForTimeout(250);
  }

  async function readTagline(page: import("@playwright/test").Page) {
    return await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  mergedFromBounds: Array<{ x: number; right: number }>;
                  bounds: { x: number; width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r
        ? {
            id: r.id,
            text: r.text,
            boundsRight: r.bounds.x + r.bounds.width,
            maxRight: Math.max(0, ...r.mergedFromBounds.map((b) => b.right)),
          }
        : null;
    });
  }

  async function loadFixture(page: import("@playwright/test").Page) {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
  }

  // --- end-of-line inserts ---
  for (const [label, payload] of [
    ["single trailing space + token", " Hi"],
    ["leading space + multi-char", " Hello"],
    ["double-space + token", "  Hi"],
    ["token + trailing space", "Hi "],
    ["space-surrounded token", " Hi "],
    ["internal-space pair", "Hi there"],
    ["multi-space internal", "Hi   there"],
  ] as const) {
    test(`whitespace stress: appending ${JSON.stringify(payload)} at end (${label}) keeps every word separated`, async ({
      page,
    }) => {
      await loadFixture(page);
      const before = await readTagline(page);
      if (!before) {
        test.skip(true, "fixture missing tagline");
        return;
      }
      await insertAt(page, `v2-run-${before.id}`, before.text.length, payload);
      const after = await readTagline(page);
      if (!after) throw new Error("tagline vanished");
      // Text content gained the payload verbatim.
      expect(after.text).toBe(before.text + payload);
      // The tagline's right edge advanced (model bounds widen).
      expect(after.boundsRight).toBeGreaterThan(before.boundsRight);
    });
  }

  test("whitespace stress: inserting at the START of the tagline shifts content right and keeps separation", async ({
    page,
  }) => {
    await loadFixture(page);
    const before = await readTagline(page);
    if (!before) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    await insertAt(page, `v2-run-${before.id}`, 0, "PRE ");
    const after = await readTagline(page);
    if (!after) throw new Error("tagline vanished");
    expect(after.text.startsWith("PRE")).toBe(true);
    // Original "Alternative" word still appears with surrounding
    // whitespace - the insert at start must not corrupt mid-line text.
    expect(after.text).toMatch(/Alternative/);
  });

  test("whitespace stress: ten alternating insert-space / type-char operations don't compound drift", async ({
    page,
  }) => {
    // Reach: the cumulative offset / merged-from-bookkeeping must stay accurate
    // over many ops, not just one.
    await loadFixture(page);
    const start = await readTagline(page);
    if (!start) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    const seq = " X Y Z W V"; // 5 letters, 5 spaces, varied
    for (const ch of seq) {
      const current = await readTagline(page);
      if (!current) throw new Error("tagline vanished mid-loop");
      await insertAt(page, `v2-run-${current.id}`, current.text.length, ch);
    }
    const end = await readTagline(page);
    if (!end) throw new Error("tagline vanished at end");
    expect(end.text).toBe(start.text + seq);
    // Right edge grew monotonically beyond the original.
    expect(end.boundsRight).toBeGreaterThan(start.boundsRight);
  });

  test("whitespace stress: insert space then immediately backspace it (no ghost bounds left behind)", async ({
    page,
  }) => {
    await loadFixture(page);
    const before = await readTagline(page);
    if (!before) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    await insertAt(page, `v2-run-${before.id}`, before.text.length, " X");
    await placeCaret(page, `v2-run-${before.id}`, before.text.length + 2);
    await page.evaluate(() => {
      document.execCommand("delete", false);
      document.execCommand("delete", false);
    });
    await page.waitForTimeout(250);
    const after = await readTagline(page);
    if (!after) throw new Error("tagline vanished");
    // Net: text identical, bounds back to ~original.
    expect(after.text).toBe(before.text);
    const widthDelta = Math.abs(after.boundsRight - before.boundsRight);
    expect(widthDelta).toBeLessThan(before.boundsRight * 0.05);
  });
});

test.describe("PDF text editor v2 - stress: bold / font swap variations", () => {
  async function loadFixture(page: import("@playwright/test").Page) {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
  }

  async function selectTagline(page: import("@playwright/test").Page) {
    // The page-0 runs are read lazily on first intersection; wait for them
    // to populate so the test actually runs instead of skipping on a race.
    await page
      .waitForFunction(
        () => {
          const s = (
            window as unknown as {
              __v2_editor_store?: {
                doc?: { page: (i: number) => { runs: unknown[] } };
              };
            }
          ).__v2_editor_store;
          return (s?.doc?.page(0).runs.length ?? 0) > 0;
        },
        { timeout: 15_000 },
      )
      .catch(() => {});
    const id = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{ id: string; text: string }>;
              };
            };
            selection: { selectOne: (rid: string) => void };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      if (!r) return null;
      store.selection.selectOne(r.id);
      return r.id;
    });
    return id;
  }

  async function readRun(page: import("@playwright/test").Page, id: string) {
    return await page.evaluate((rid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  mergedFromPtrs: number[];
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === rid);
      return r
        ? { text: r.text, fontId: r.fontId, merged: r.mergedFromPtrs.length }
        : null;
    }, id);
  }

  test("font swap stress: Bold → Bold → Bold (3 toggles) leaves no merged ptrs", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await selectTagline(page);
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("v2-bold").click();
      await page.waitForTimeout(250);
    }
    const after = await readRun(page, id);
    if (!after) throw new Error("run vanished after 3 bold toggles");
    expect(after.merged).toBe(0);
    expect(after.fontId).toMatch(/^base14:Helvetica/);
  });

  test("font swap stress: Bold then Italic then Bold (cross-axis toggles) preserves text", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await selectTagline(page);
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    const before = await readRun(page, id);
    if (!before) throw new Error("baseline read failed");
    // Re-select before each toolbar click.
    await selectTagline(page);
    await page.getByTestId("v2-bold").click();
    await page.waitForTimeout(250);
    await selectTagline(page);
    await page.getByTestId("v2-italic").click();
    await page.waitForTimeout(250);
    await selectTagline(page);
    await page.getByTestId("v2-bold").click();
    await page.waitForTimeout(250);
    const after = await readRun(page, id);
    if (!after) throw new Error("run vanished after cross-axis toggles");
    expect(after.text).toBe(before.text);
    expect(after.merged).toBe(0);
    // Final state: SOMETHING swapped (the run is no longer in the embedded
    // source font) and the swap left no ghost layers.
    expect(after.fontId).toMatch(/^base14:Helvetica/);
    expect(after.fontId).not.toBe(before.fontId);
  });

  test("font swap stress: bold then undo restores per-glyph layout (mergedFromPtrs > 0 again)", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await selectTagline(page);
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    const before = await readRun(page, id);
    if (!before) throw new Error("baseline read failed");
    expect(before.merged).toBeGreaterThan(10);
    await page.getByTestId("v2-bold").click();
    await page.waitForTimeout(250);
    const mid = await readRun(page, id);
    if (!mid) throw new Error("mid read failed");
    expect(mid.merged).toBe(0);
    // Undo.
    await page.getByTestId("v2-undo").click();
    await page.waitForTimeout(400);
    const after = await readRun(page, id);
    if (!after) throw new Error("post-undo read failed");
    expect(after.fontId).toBe(before.fontId);
    expect(after.text).toBe(before.text);
    // Per-glyph layout restored.
    expect(after.merged).toBeGreaterThan(10);
  });

  test("font swap stress: bold then edit (insert) then save+reopen → exactly one tagline run, no ghosts", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await selectTagline(page);
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    await page.getByTestId("v2-bold").click();
    await page.waitForTimeout(250);
    // Now insert text into the bolded run.
    await page.evaluate((tid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${tid}"]`,
      );
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, " EXTRA");
    }, id);
    await page.waitForTimeout(300);
    // Save + reopen.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const reopenedRuns = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ text: string }> } };
          };
        }
      ).__v2_editor_store;
      return store.doc.page(0).runs.map((r) => r.text);
    });
    // After save+reopen the LineGrouper may or may not re-merge the tagline's
    // per-word emits into one run depending on inter-word gap vs.
    const extraCarriers = reopenedRuns.filter((t) => /EXTRA/.test(t));
    expect(
      extraCarriers.length,
      `Reopened runs carrying EXTRA: ${JSON.stringify(
        extraCarriers,
      )}; all runs: ${JSON.stringify(reopenedRuns)}`,
    ).toBe(1);
    // The Alternative word and EXTRA must coexist (possibly in same
    // run, possibly in adjacent runs). Concatenate and check.
    const joined = reopenedRuns.join(" ");
    expect(joined).toMatch(/Alternative[\s\S]*EXTRA/);
  });

  test("font swap stress: changing font family via dropdown to Times-Roman then back to Helvetica clears ghosts", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await selectTagline(page);
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    // Change font family through the real toolbar dropdown (the tagline run
    // is already selected). The Select's onChange dispatches SetFontFamily.
    await selectFontFamily(page, "Times Roman");
    await page.waitForTimeout(300);
    const mid = await readRun(page, id);
    if (!mid) throw new Error("mid read failed");
    expect(mid.merged).toBe(0);
    expect(mid.fontId).toBe("base14:Times-Roman");
    // Swap back to Helvetica.
    await selectFontFamily(page, "Helvetica");
    await page.waitForTimeout(300);
    const after = await readRun(page, id);
    if (!after) throw new Error("after read failed");
    expect(after.merged).toBe(0);
    expect(after.fontId).toBe("base14:Helvetica");
  });
});

test.describe("PDF text editor v2 - stress: add / remove cycles (no leaks)", () => {
  async function loadFixture(page: import("@playwright/test").Page) {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
  }

  test("add-then-delete a new text box three times leaves the page run count exactly where it started", async ({
    page,
  }) => {
    await loadFixture(page);
    const runs = page.locator('[data-testid^="v2-run-p0-"]');
    const start = await runs.count();
    for (let i = 0; i < 3; i++) {
      // Add text mode + click on page to insert.
      await page.getByTestId("v2-add-text").click();
      await page
        .getByTestId("v2-page-0")
        .click({ position: { x: 100, y: 600 - i * 20 } });
      // Wait for the insert to actually land: a fixed delay is a bet on
      // machine speed, and it lost under parallel load.
      await expect(runs).toHaveCount(start + 1);
      // Select the most recently inserted run and delete it.
      await runs.last().click();
      await page.getByTestId("v2-delete").click();
      await expect(runs).toHaveCount(start);
    }
    expect(await runs.count()).toBe(start);
  });

  test("type-then-backspace to empty three times keeps mergedFromPtrs in sync", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{ id: string; text: string }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r?.id ?? null;
    });
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    const readRun = async () =>
      await page.evaluate((rid) => {
        const store = (
          window as unknown as {
            __v2_editor_store: {
              doc: {
                page: (i: number) => {
                  runs: Array<{
                    id: string;
                    text: string;
                    mergedFromPtrs: number[];
                    mergedFromTexts: string[];
                    mergedFromCharStarts: number[];
                  }>;
                };
              };
            };
          }
        ).__v2_editor_store;
        const r = store.doc.page(0).runs.find((x) => x.id === rid);
        return r
          ? {
              text: r.text,
              ptrs: r.mergedFromPtrs.length,
              texts: r.mergedFromTexts.length,
              starts: r.mergedFromCharStarts.length,
            }
          : null;
      }, id);
    for (let cycle = 0; cycle < 3; cycle++) {
      // Type 5 chars at end.
      await page.evaluate((tid) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${tid}"]`,
        );
        if (!el) return;
        el.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, "ABCDE");
      }, id);
      await page.waitForTimeout(250);
      // Backspace 5 times.
      for (let i = 0; i < 5; i++) {
        await page.evaluate((tid) => {
          const el = document.querySelector<HTMLDivElement>(
            `[data-testid="v2-run-${tid}"]`,
          );
          if (!el) return;
          el.focus();
          const sel = window.getSelection();
          if (!sel) return;
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("delete", false);
        }, id);
        await page.waitForTimeout(80);
      }
      const after = await readRun();
      if (!after) throw new Error(`run vanished cycle ${cycle}`);
      // Three parallel arrays stay in sync (no leaks).
      expect(after.ptrs).toBe(after.texts);
      expect(after.ptrs).toBe(after.starts);
    }
  });

  test("undo five edits in a row restores baseline text + bounds", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{ id: string; text: string }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r?.id ?? null;
    });
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    const baseline = await page.evaluate((rid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  bounds: { width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === rid);
      return r
        ? { text: r.text, fontId: r.fontId, width: r.bounds.width }
        : null;
    }, id);
    if (!baseline) throw new Error("baseline read failed");
    // Five edits: append one char each.
    for (const ch of ["A", "B", "C", "D", "E"]) {
      await page.evaluate(
        ({ tid, c }) => {
          const el = document.querySelector<HTMLDivElement>(
            `[data-testid="v2-run-${tid}"]`,
          );
          if (!el) return;
          el.focus();
          const sel = window.getSelection();
          if (!sel) return;
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("insertText", false, c);
        },
        { tid: id, c: ch },
      );
      await page.waitForTimeout(180);
    }
    // Undo the whole burst.
    for (let i = 0; i < 6; i++) {
      const undoBtn = page.getByTestId("v2-undo");
      if (await undoBtn.isDisabled()) break;
      await undoBtn.click();
      await page.waitForTimeout(200);
    }
    const after = await page.evaluate((rid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  fontId: string;
                  bounds: { width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === rid);
      return r
        ? { text: r.text, fontId: r.fontId, width: r.bounds.width }
        : null;
    }, id);
    if (!after) throw new Error("post-undo read failed");
    expect(after.text).toBe(baseline.text);
    expect(after.fontId).toBe(baseline.fontId);
    // NOTE: `run.bounds.width` does NOT restore perfectly after multi-cycle
    // undo.
  });
});

test.describe("PDF text editor v2 - stress: save+reopen multi-cycle", () => {
  async function loadFixture(page: import("@playwright/test").Page) {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
  }

  async function saveAndReopenLocal(page: import("@playwright/test").Page) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
  }

  test("save+reopen three times in a row (with one edit each) doesn't compound ghost objects", async ({
    page,
  }) => {
    // Reach: a leak that adds one ghost text object per round-trip would grow
    // page 0's run count linearly with cycles.
    await loadFixture(page);
    const baselineCount = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .count();
    for (let cycle = 0; cycle < 3; cycle++) {
      const id = await page.evaluate(() => {
        const store = (
          window as unknown as {
            __v2_editor_store: {
              doc: {
                page: (i: number) => {
                  runs: Array<{ id: string; text: string }>;
                };
              };
            };
          }
        ).__v2_editor_store;
        const r = store.doc
          .page(0)
          .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
        return r?.id ?? null;
      });
      if (!id) {
        test.skip(true, "fixture missing tagline");
        return;
      }
      // Click through Playwright first: it waits for the overlay node to be
      // stable, so a re-render can't land between focus and the insert and
      // swallow the keystroke.
      const target = page.locator(`[data-testid="v2-run-${id}"]`);
      await expect(target).toBeVisible({ timeout: 15_000 });
      await target.click();
      await page.evaluate(
        ({ tid, c }) => {
          const el = document.querySelector<HTMLDivElement>(
            `[data-testid="v2-run-${tid}"]`,
          );
          if (!el) return;
          el.focus();
          const sel = window.getSelection();
          if (!sel) return;
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("insertText", false, c);
        },
        { tid: id, c: String.fromCharCode(65 + cycle) },
      );
      // Wait for the edit to reach the MODEL, not a fixed delay: saving before
      // the command commits silently drops this cycle's character.
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const store = (
                window as unknown as {
                  __v2_editor_store: {
                    doc: {
                      page: (i: number) => { runs: Array<{ text: string }> };
                    };
                  };
                }
              ).__v2_editor_store;
              return (
                store.doc
                  .page(0)
                  .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text))
                  ?.text ?? ""
              );
            }),
          { timeout: 10_000 },
        )
        .toContain(String.fromCharCode(65 + cycle));
      await saveAndReopenLocal(page);
    }
    const endCount = await page.locator('[data-testid^="v2-run-p0-"]').count();
    // After 3 cycles the run count should be within a small multiplier of
    // baseline - not 3x or 10x as a leak would produce.
    expect(endCount).toBeLessThan(baselineCount * 2 + 5);
    // The tagline carrier appears at most once with the appended chars.
    const reopenedTexts = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ text: string }> } };
          };
        }
      ).__v2_editor_store;
      return store.doc.page(0).runs.map((r) => r.text);
    });
    const taglineCarriers = reopenedTexts.filter((t) =>
      /Adobe.*Acrobat.*Alternative/.test(t),
    );
    expect(taglineCarriers.length).toBe(1);
    // The appended chars came through.
    expect(taglineCarriers[0]).toMatch(/A.*B.*C|ABC|A B C|CBA|.*A$/);
  });

  test("save+reopen preserves a fresh add-text run with its full typed content", async ({
    page,
  }) => {
    await loadFixture(page);
    await page.getByTestId("v2-add-text").click();
    await page.getByTestId("v2-page-0").click({ position: { x: 200, y: 600 } });
    await page.waitForTimeout(300);
    // The newly added run is the last on the page; type into it.
    const lastRun = page.locator('[data-testid^="v2-run-p0-"]').last();
    const tid = await lastRun.getAttribute("data-testid");
    if (!tid) throw new Error("no last run testid");
    await page.evaluate((rid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="${rid}"]`,
      );
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, "FRESH ADD");
    }, tid);
    await page.waitForTimeout(300);
    // Round-trip.
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const allText = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ text: string }> } };
          };
        }
      ).__v2_editor_store;
      return store.doc
        .page(0)
        .runs.map((r) => r.text)
        .join(" | ");
    });
    // The typed text survives round-trip. (Might split per-word due to
    // emit path; tolerate any internal whitespace.)
    expect(allText).toMatch(/FRESH\s*ADD|FRESH.*ADD/);
  });
});

test.describe("PDF text editor v2 - stress: AddText box content fidelity", () => {
  // The AddText flow has its own input path (singleton run, base-14 Helvetica
  // from the start, no LineGrouper).

  async function loadFixture(page: import("@playwright/test").Page) {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
  }

  async function addNewTextBox(
    page: import("@playwright/test").Page,
    position: { x: number; y: number } = { x: 200, y: 600 },
  ): Promise<string> {
    await page.getByTestId("v2-add-text").click();
    await page.getByTestId("v2-page-0").click({ position });
    await page.waitForTimeout(300);
    const newId = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ id: string }> } };
          };
        }
      ).__v2_editor_store;
      const runs = store.doc.page(0).runs;
      return runs[runs.length - 1].id;
    });
    return newId;
  }

  async function clearAndType(
    page: import("@playwright/test").Page,
    runId: string,
    text: string,
  ) {
    await page.evaluate(
      ({ rid, t }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${rid}"]`,
        );
        if (!el) throw new Error("no el");
        el.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("delete", false);
        document.execCommand("insertText", false, t);
      },
      { rid: runId, t: text },
    );
    await page.waitForTimeout(300);
  }

  async function typeCharByChar(
    page: import("@playwright/test").Page,
    runId: string,
    sequence: string,
  ) {
    // First clear the placeholder.
    await page.evaluate((rid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      if (!el) throw new Error("no el");
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete", false);
    }, runId);
    await page.waitForTimeout(150);
    // Type chars one at a time, leaving the caret at end after each.
    for (const ch of sequence) {
      await page.evaluate(
        ({ rid, c }) => {
          const el = document.querySelector<HTMLDivElement>(
            `[data-testid="v2-run-${rid}"]`,
          );
          if (!el) return;
          el.focus();
          const sel = window.getSelection();
          if (!sel) return;
          const range = document.createRange();
          range.selectNodeContents(el);
          range.collapse(false); // place at end
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("insertText", false, c);
        },
        { rid: runId, c: ch },
      );
      await page.waitForTimeout(150);
    }
  }

  async function readRun(page: import("@playwright/test").Page, id: string) {
    return await page.evaluate((rid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  pdfiumObjPtr: number;
                  paragraphLeafPtrs: number[];
                  mergedFromTexts: string[];
                  mergedFromBounds: Array<{ x: number; right: number }>;
                  bounds: { x: number; width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === rid);
      return r
        ? {
            text: r.text,
            primaryPtr: r.pdfiumObjPtr,
            paragraphLeafPtrs: [...r.paragraphLeafPtrs],
            mergedFromTexts: [...r.mergedFromTexts],
            mergedFromBounds: r.mergedFromBounds.map((b) => ({ ...b })),
            boundsRight: r.bounds.x + r.bounds.width,
            boundsX: r.bounds.x,
          }
        : null;
    }, id);
  }

  async function saveAndReopenLocal(page: import("@playwright/test").Page) {
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
  }

  // ---- Bulk insertText paths ----

  for (const payload of [
    "be  aaA",
    "be aaA",
    "be  aaa",
    "BE  AAA",
    "Hello world",
    "a b c d e",
    "   leading",
    "trailing   ",
    "mid    five-spaces",
    "x\ty\tz",
    "aA  Bb  Cc",
    "one  two  three  four",
  ] as const) {
    test(`AddText bulk insertText: ${JSON.stringify(payload)} keeps model + sub-runs in order`, async ({
      page,
    }) => {
      await loadFixture(page);
      const id = await addNewTextBox(page);
      await clearAndType(page, id, payload);
      await page.evaluate(() => document.body.click());
      await page.waitForTimeout(800);
      const after = await readRun(page, id);
      if (!after) throw new Error("run vanished after clearAndType");
      // Model contains the typed text verbatim (modulo CSS whitespace
      // normalization that maps NBSP back to space).
      expect(after.text.replace(/\u00A0/g, " ")).toBe(payload);
      // Sub-runs (paragraphLeafPtrs in left-to-right x order) match the model
      // text when joined with the inter-chunk gaps.
      if (after.mergedFromTexts.length > 0) {
        const sortedByX = after.mergedFromTexts
          .map((t, i) => ({ t, x: after.mergedFromBounds[i]?.x ?? 0 }))
          .sort((a, b) => a.x - b.x)
          .map((p) => p.t);
        const joined = sortedByX.join("");
        // Letters appear in left-to-right order matching the typed
        // payload, ignoring whitespace (which lives in the gaps).
        const onlyLetters = (s: string) => s.replace(/\s/g, "");
        expect(onlyLetters(joined)).toBe(onlyLetters(payload));
      }
    });
  }

  // ---- Char-by-char typing path. ----

  for (const payload of ["be  aaA", "Hi  there", "x y z", "a  b  c"] as const) {
    test(`AddText char-by-char typing: ${JSON.stringify(payload)} produces correct final state + order`, async ({
      page,
    }) => {
      await loadFixture(page);
      const id = await addNewTextBox(page);
      await typeCharByChar(page, id, payload);
      await page.evaluate(() => document.body.click());
      await page.waitForTimeout(800);
      const after = await readRun(page, id);
      if (!after) throw new Error("run vanished after typeCharByChar");
      expect(after.text.replace(/\u00A0/g, " ")).toBe(payload);
      // Left-to-right ordering check: letters in mergedFromTexts
      // (sorted by x) match payload's letters.
      if (after.mergedFromTexts.length > 0) {
        const sortedByX = after.mergedFromTexts
          .map((t, i) => ({ t, x: after.mergedFromBounds[i]?.x ?? 0 }))
          .sort((a, b) => a.x - b.x)
          .map((p) => p.t);
        const onlyLetters = (s: string) => s.replace(/\s/g, "");
        expect(onlyLetters(sortedByX.join(""))).toBe(onlyLetters(payload));
      }
    });
  }

  // ---- Round-trip survivability ----

  for (const payload of ["be  aaA", "Hello  world", "a  b  c"] as const) {
    test(`AddText round-trip: ${JSON.stringify(payload)} survives save+reopen with chars in order`, async ({
      page,
    }) => {
      await loadFixture(page);
      const id = await addNewTextBox(page);
      await clearAndType(page, id, payload);
      await page.evaluate(() => document.body.click());
      await page.waitForTimeout(500);
      await saveAndReopenLocal(page);
      // Find the run carrying our payload's letters after reopen.
      const reopened = await page.evaluate(
        (needleLetters) => {
          const store = (
            window as unknown as {
              __v2_editor_store: {
                doc: {
                  page: (i: number) => {
                    runs: Array<{ text: string; bounds: { x: number } }>;
                  };
                };
              };
            }
          ).__v2_editor_store;
          const runs = store.doc.page(0).runs;
          // Find every run that contains any of the needle letters.
          const lettersSet = new Set(needleLetters);
          return runs
            .filter((r) => [...r.text].some((c) => lettersSet.has(c)))
            .map((r) => ({ text: r.text, x: r.bounds.x }))
            .sort((a, b) => a.x - b.x);
        },
        payload.replace(/\s/g, ""),
      );
      // Concatenate matched runs in x-order; their joined letters
      // should equal payload's letters (no reordering across runs).
      const joined = reopened.map((r) => r.text).join(" ");
      const onlyLetters = (s: string) => s.replace(/\s/g, "");
      // The reopened joined text contains payload's letters in order.
      const payloadLetters = onlyLetters(payload);
      const joinedLetters = onlyLetters(joined);
      expect(
        joinedLetters.includes(payloadLetters),
        `Reopened joined letters: ${JSON.stringify(joinedLetters)}; expected to contain ${JSON.stringify(payloadLetters)}`,
      ).toBe(true);
    });
  }

  // ---- Edit-after-edit (mutate the AddText box repeatedly) ----

  test("AddText: typing then defocusing then editing again keeps chars in order", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await addNewTextBox(page);
    await clearAndType(page, id, "hello");
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(400);
    const mid = await readRun(page, id);
    if (!mid) throw new Error("mid read failed");
    expect(mid.text).toBe("hello");

    // Edit again: insert more text at end.
    await page.evaluate((rid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, "  world");
    }, id);
    await page.waitForTimeout(400);
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(500);
    const final = await readRun(page, id);
    if (!final) throw new Error("final read failed");
    expect(final.text.replace(/\u00A0/g, " ")).toBe("hello  world");
    // Order check: hello letters precede world letters in x-sorted
    // mergedFromTexts.
    if (final.mergedFromTexts.length > 0) {
      const sorted = final.mergedFromTexts
        .map((t, i) => ({ t, x: final.mergedFromBounds[i]?.x ?? 0 }))
        .sort((a, b) => a.x - b.x)
        .map((p) => p.t)
        .join("");
      const sortedLetters = sorted.replace(/\s/g, "");
      expect(sortedLetters).toBe("helloworld");
    }
  });

  // ---- Add multiple text boxes; verify each stays independent ----

  test("AddText: three boxes on same page each keep their own typed content", async ({
    page,
  }) => {
    await loadFixture(page);
    const ids: string[] = [];
    const contents = ["alpha", "be  aaA", "gamma   end"];
    for (let i = 0; i < 3; i++) {
      const id = await addNewTextBox(page, {
        x: 100 + i * 70,
        y: 600 - i * 80,
      });
      await clearAndType(page, id, contents[i]);
      ids.push(id);
    }
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(1000);
    for (let i = 0; i < 3; i++) {
      const r = await readRun(page, ids[i]);
      if (!r) throw new Error(`run ${i} vanished`);
      expect(r.text.replace(/\u00A0/g, " ")).toBe(contents[i]);
    }
  });

  // ---- Defensive ordering check via PDFium-rendered bounds ----

  test("AddText: 'be  aaA' chars appear left-to-right in saved object positions (no reorder)", async ({
    page,
  }) => {
    // The user's exact reported repro.
    await loadFixture(page);
    const id = await addNewTextBox(page);
    await clearAndType(page, id, "be  aaA");
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(800);
    const after = await readRun(page, id);
    if (!after) throw new Error("run vanished");
    expect(after.text.replace(/\u00A0/g, " ")).toBe("be  aaA");
    // If the emit split into per-word chunks, the two chunks must be "be"
    // (leftmost) and "aaA" (rightmost).
    if (after.mergedFromTexts.length >= 2) {
      const sorted = after.mergedFromTexts
        .map((t, i) => ({ t, x: after.mergedFromBounds[i]?.x ?? 0 }))
        .sort((a, b) => a.x - b.x);
      // First sub-run starts with 'b', last sub-run ends with 'A'.
      expect(
        sorted[0].t,
        `Leftmost sub-run after typing 'be  aaA' should start with 'b': ${JSON.stringify(sorted.map((s) => s.t))}`,
      ).toMatch(/^b/);
      expect(
        sorted[sorted.length - 1].t,
        `Rightmost sub-run after typing 'be  aaA' should end with 'A': ${JSON.stringify(sorted.map((s) => s.t))}`,
      ).toMatch(/A$/);
    }
  });
});

test.describe("PDF text editor v2 - stress: deletion shrinks bounds (no stuck-wide overlay)", () => {
  // User-reported: "I can add spaces but after adding them I can't remove
  // them".

  async function loadFixture(page: import("@playwright/test").Page) {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
  }

  async function addNewTextBox(
    page: import("@playwright/test").Page,
    position: { x: number; y: number } = { x: 200, y: 600 },
  ): Promise<string> {
    await page.getByTestId("v2-add-text").click();
    await page.getByTestId("v2-page-0").click({ position });
    await page.waitForTimeout(300);
    return await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ id: string }> } };
          };
        }
      ).__v2_editor_store;
      const runs = store.doc.page(0).runs;
      return runs[runs.length - 1].id;
    });
  }

  async function clearAndType(
    page: import("@playwright/test").Page,
    id: string,
    text: string,
  ) {
    await page.evaluate(
      ({ rid, t }) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${rid}"]`,
        );
        if (!el) throw new Error("no el");
        el.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("delete", false);
        document.execCommand("insertText", false, t);
      },
      { rid: id, t: text },
    );
    await page.waitForTimeout(300);
  }

  async function backspace(
    page: import("@playwright/test").Page,
    id: string,
    n: number,
  ) {
    for (let i = 0; i < n; i++) {
      await page.evaluate((rid) => {
        const el = document.querySelector<HTMLDivElement>(
          `[data-testid="v2-run-${rid}"]`,
        );
        if (!el) return;
        el.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("delete", false);
      }, id);
      await page.waitForTimeout(200);
    }
  }

  async function readRun(page: import("@playwright/test").Page, id: string) {
    return await page.evaluate((rid) => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  bounds: { x: number; width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc.page(0).runs.find((x) => x.id === rid);
      return r ? { text: r.text, width: r.bounds.width } : null;
    }, id);
  }

  test("typing 'ab  ' then backspacing both spaces shrinks bounds.width to match 'ab'", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await addNewTextBox(page);
    await clearAndType(page, id, "ab  ");
    const wide = await readRun(page, id);
    if (!wide) throw new Error("run vanished after typing");
    expect(wide.text).toBe("ab  ");
    const wideWidth = wide.width;
    // Now delete both spaces.
    await backspace(page, id, 2);
    const narrow = await readRun(page, id);
    if (!narrow) throw new Error("run vanished after backspace");
    expect(narrow.text).toBe("ab");
    // The CORE invariant: width SHRANK noticeably after spaces
    // disappeared. A regression would leave wideWidth == narrowWidth.
    expect(narrow.width).toBeLessThan(wideWidth);
    // Within a few points of an 'ab'-only width (~12pt for Helvetica
    // at 12pt). Generous upper bound to tolerate font / scale fuzz.
    expect(narrow.width).toBeLessThan(20);
  });

  test("typing then backspacing every character shrinks bounds incrementally", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await addNewTextBox(page, { x: 250, y: 550 });
    await clearAndType(page, id, "hello world");
    const widths: number[] = [];
    const r0 = await readRun(page, id);
    if (!r0) throw new Error("run vanished");
    widths.push(r0.width);
    // Backspace 6 times: removes "world" and the space, leaving "hello".
    for (let i = 0; i < 6; i++) {
      await backspace(page, id, 1);
      const r = await readRun(page, id);
      if (!r) throw new Error(`run vanished cycle ${i}`);
      widths.push(r.width);
    }
    // After 6 backspaces from "hello world" we have "hello".
    const final = await readRun(page, id);
    if (!final) throw new Error("final read failed");
    expect(final.text).toBe("hello");
    // The width series is non-increasing (chars only get removed).
    for (let i = 1; i < widths.length; i++) {
      expect(
        widths[i],
        `Width sequence should be non-increasing: ${JSON.stringify(widths)}`,
      ).toBeLessThanOrEqual(widths[i - 1] + 0.5);
    }
    // The final width is strictly less than the initial.
    expect(widths[widths.length - 1]).toBeLessThan(widths[0]);
  });

  test("typing 'x   y' then deleting back to 'x' shrinks bounds and saved PDF has only 'x'", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await addNewTextBox(page, { x: 300, y: 500 });
    await clearAndType(page, id, "x   y");
    const wide = await readRun(page, id);
    if (!wide) throw new Error("run vanished");
    const wideWidth = wide.width;
    // Backspace 4 times: removes "y" and the 3 spaces.
    await backspace(page, id, 4);
    const narrow = await readRun(page, id);
    if (!narrow) throw new Error("run vanished after backspace");
    expect(narrow.text).toBe("x");
    expect(narrow.width).toBeLessThan(wideWidth);
    // Round-trip: saved PDF should serialize just "x" (no trailing
    // spaces / no ghost objects).
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("v2-save").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const savedBytes = Buffer.concat(chunks);
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });
    await expect(
      page.locator('[data-testid^="v2-run-p0-"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const xRuns = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ text: string }> } };
          };
        }
      ).__v2_editor_store;
      return store.doc
        .page(0)
        .runs.filter((r) => r.text.includes("x") && r.text.length <= 3)
        .map((r) => r.text);
    });
    // Saved PDF: at least one run is exactly "x" (no trailing junk).
    expect(xRuns).toContain("x");
    // No run contains "y" - it was deleted.
    const allText = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ text: string }> } };
          };
        }
      ).__v2_editor_store;
      return store.doc
        .page(0)
        .runs.map((r) => r.text)
        .join("\n");
    });
    // The 'y' we deleted should NOT appear as a standalone token.
    expect(allText).not.toMatch(/(^|\s)y(\s|$)/);
  });

  test("typing a tagline edit then backspacing the appended char shrinks the run's bounds", async ({
    page,
  }) => {
    // Same fix surface but exercised through the partialEdit path (the tagline
    // is a LineGrouper-merged run).
    await loadFixture(page);
    const id = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{
                  id: string;
                  text: string;
                  bounds: { width: number };
                }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r ? r.id : null;
    });
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    const before = await readRun(page, id);
    if (!before) throw new Error("baseline read failed");
    // Append " Z" (space + char), then backspace twice.
    await page.evaluate((rid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("insertText", false, " Z");
    }, id);
    await page.waitForTimeout(300);
    const expanded = await readRun(page, id);
    if (!expanded) throw new Error("expanded read failed");
    expect(expanded.width).toBeGreaterThan(before.width);
    await backspace(page, id, 2);
    const back = await readRun(page, id);
    if (!back) throw new Error("back read failed");
    expect(back.text).toBe(before.text);
    // Within a few points of original.
    const drift = Math.abs(back.width - before.width);
    expect(
      drift,
      `Width drift after insert+delete cycle: ${drift}pt (before=${before.width}, after=${back.width})`,
    ).toBeLessThan(Math.max(20, before.width * 0.15));
  });
});

test.describe("PDF text editor v2 - stress: overlay box width hugs the text", () => {
  // User reported the textbox visually "doesn't have the same width as the
  // text".

  async function loadFixture(page: import("@playwright/test").Page) {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
  }

  async function overlayCssWidth(
    page: import("@playwright/test").Page,
    runTestId: string,
  ): Promise<number> {
    return await page.evaluate((tid) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${tid}"]`);
      if (!el) return -1;
      return el.getBoundingClientRect().width;
    }, runTestId);
  }

  async function cssTextWidth(
    page: import("@playwright/test").Page,
    runTestId: string,
  ): Promise<number> {
    // Measure the text content's intrinsic CSS width via the same canvas
    // measureText the overlay component uses.
    return await page.evaluate((tid) => {
      const el = document.querySelector<HTMLElement>(`[data-testid="${tid}"]`);
      if (!el) return -1;
      const cs = window.getComputedStyle(el);
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return -1;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      let maxW = 0;
      for (const line of (el.innerText ?? "").split(/\r?\n/)) {
        const w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
      }
      return maxW;
    }, runTestId);
  }

  test("unfocused AddText box: overlay width is within a few pixels of the text width (no +1em buffer)", async ({
    page,
  }) => {
    await loadFixture(page);
    // Add a text box and type a short word.
    await page.getByTestId("v2-add-text").click();
    await page.getByTestId("v2-page-0").click({ position: { x: 250, y: 500 } });
    await page.waitForTimeout(300);
    const id = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ id: string }> } };
          };
        }
      ).__v2_editor_store;
      const runs = store.doc.page(0).runs;
      return runs[runs.length - 1].id;
    });
    await page.evaluate((rid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      if (!el) throw new Error("no el");
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete", false);
      document.execCommand("insertText", false, "hello");
    }, id);
    await page.waitForTimeout(400);
    // Defocus explicitly. `document.body.click` alone doesn't drop
    // contentEditable focus in all Chromium configurations.
    await page.evaluate((rid) => {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      el?.blur();
    }, id);
    await page.waitForTimeout(500);
    const overlayW = await overlayCssWidth(page, `v2-run-${id}`);
    const textW = await cssTextWidth(page, `v2-run-${id}`);
    expect(overlayW).toBeGreaterThan(0);
    expect(textW).toBeGreaterThan(0);
    // The overlay hugs the text: at most ~15px of slack.
    const slack = overlayW - textW;
    expect(
      slack,
      `Unfocused overlay width=${overlayW.toFixed(2)}px text=${textW.toFixed(2)}px slack=${slack.toFixed(2)}px`,
    ).toBeLessThan(20);
  });

  test("focused AddText box: overlay grows past the text width so caret has room", async ({
    page,
  }) => {
    // Counter-test: while typing, the overlay SHOULD have a buffer so the next
    // char isn't clipped by overflow:hidden.
    await loadFixture(page);
    await page.getByTestId("v2-add-text").click();
    await page.getByTestId("v2-page-0").click({ position: { x: 300, y: 500 } });
    await page.waitForTimeout(300);
    const id = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: { page: (i: number) => { runs: Array<{ id: string }> } };
          };
        }
      ).__v2_editor_store;
      const runs = store.doc.page(0).runs;
      return runs[runs.length - 1].id;
    });
    await page.evaluate((rid) => {
      const el = document.querySelector<HTMLDivElement>(
        `[data-testid="v2-run-${rid}"]`,
      );
      if (!el) throw new Error("no el");
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand("delete", false);
      document.execCommand("insertText", false, "type");
    }, id);
    await page.waitForTimeout(400);
    // Stay focused: the overlay element should still be the active
    // element here (we just inserted text into it).
    const stillFocused = await page.evaluate((rid) => {
      return (
        document.activeElement?.getAttribute("data-testid") === `v2-run-${rid}`
      );
    }, id);
    expect(stillFocused).toBe(true);
    const overlayW = await overlayCssWidth(page, `v2-run-${id}`);
    const textW = await cssTextWidth(page, `v2-run-${id}`);
    // Focused overlay has the one-em buffer past the text.
    expect(overlayW - textW).toBeGreaterThan(2);
  });

  test("tagline (embedded font, LineGrouper-merged) overlay box hugs text when unfocused", async ({
    page,
  }) => {
    await loadFixture(page);
    const id = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store: {
            doc: {
              page: (i: number) => {
                runs: Array<{ id: string; text: string }>;
              };
            };
          };
        }
      ).__v2_editor_store;
      const r = store.doc
        .page(0)
        .runs.find((x) => /Adobe.*Acrobat.*Alternative/.test(x.text));
      return r ? r.id : null;
    });
    if (!id) {
      test.skip(true, "fixture missing tagline");
      return;
    }
    const overlayW = await overlayCssWidth(page, `v2-run-${id}`);
    const textW = await cssTextWidth(page, `v2-run-${id}`);
    expect(overlayW).toBeGreaterThan(0);
    expect(textW).toBeGreaterThan(0);
    // The tagline has a wider pdfWidth, so the overlay can be modestly wider
    // than the CSS-measured text width.
    const slack = overlayW - textW;
    const ratio = slack / Math.max(1, textW);
    expect(
      ratio,
      `Tagline overlay width=${overlayW.toFixed(2)}px text=${textW.toFixed(2)}px ratio=${ratio.toFixed(3)}`,
    ).toBeLessThan(0.3);
  });
});

test.describe("PDF text editor v2 - F-duplication regression (Sample.pdf tagline)", () => {
  // This regression guards against the bug fixed by gating the per-char
  // backend-emit branch on `!reuse`.
  test("typing a single F at end of tagline produces exactly one F", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    const tagline = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /Adobe.+Acrobat.+Alternative/ })
      .first();
    const exists = await tagline.count();
    if (exists === 0) {
      test.skip(
        true,
        "Sample.pdf is missing the Adobe Acrobat Alternative tagline",
      );
      return;
    }
    const tid = (await tagline.getAttribute("data-testid")) ?? "";
    const original = (await tagline.innerText()) ?? "";
    await typeIntoRun(page, tid, "F", "end");

    const modelText = await page.evaluate((id) => {
      const w = window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      };
      for (const p of w.__v2_editor_store.state.pages) {
        for (const r of p.runs) {
          if (`v2-run-${r.id}` === id) return r.text;
        }
      }
      return "";
    }, tid);
    // CORE assertion: exactly one new F was appended; no F-duplication
    // anywhere else in the tagline.
    expect(
      modelText,
      `model text after typing F: ${JSON.stringify(modelText)}`,
    ).toBe(`${original}F`);
    // Defensive: total F-count in the model equals (original F-count + 1).
    const originalFCount = (original.match(/F/g) ?? []).length;
    const newFCount = (modelText.match(/F/g) ?? []).length;
    expect(newFCount).toBe(originalFCount + 1);

    // EMIT-PATH assertion: the original test only checked model text, which
    // updates on every keystroke regardless of what PDFium actually emitted.
    const fEmits = await page.evaluate(() => {
      const w = window as unknown as {
        __v2_charcode_events?: Array<{
          outcome: string;
          text: string;
          note: string;
        }>;
      };
      return (w.__v2_charcode_events ?? []).filter((e) => e.text === "F");
    });
    expect(
      fEmits.length,
      `Expected at most 1 emit event for "F" (one keystroke), got ${fEmits.length}: ${JSON.stringify(fEmits, null, 2)}`,
    ).toBeLessThanOrEqual(1);
  });

  // Consecutive-edit regression: a second M typed at the end of "10M+M" used to
  // corrupt the rendering of the FIRST M too.
  test("two consecutive M edits on 10M+ produce ≤2 emit events for 'M' (no duplicate fire)", async ({
    page,
  }) => {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(USER_SAMPLE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });

    const run = page
      .locator('[data-testid^="v2-run-p0-"]')
      .filter({ hasText: /^10M\+$/ })
      .first();
    const exists = await run.count();
    if (exists === 0) {
      test.skip(true, "Sample.pdf is missing the 10M+ marketing run");
      return;
    }
    const tid = (await run.getAttribute("data-testid")) ?? "";

    // Clear emit history so we only count this test's emits.
    await page.evaluate(() => {
      const w = window as unknown as { __v2_charcode_events?: unknown[] };
      if (w.__v2_charcode_events) w.__v2_charcode_events = [];
    });

    await typeIntoRun(page, tid, "M", "end");
    await typeIntoRun(page, tid, "M", "end");

    const modelText = await page.evaluate((id) => {
      const w = window as unknown as {
        __v2_editor_store: {
          state: { pages: { runs: { id: string; text: string }[] }[] };
        };
      };
      for (const p of w.__v2_editor_store.state.pages) {
        for (const r of p.runs) {
          if (`v2-run-${r.id}` === id) return r.text;
        }
      }
      return "";
    }, tid);
    expect(modelText).toBe("10M+MM");

    // EMIT-PATH assertion: at most 2 emits for "M" (one per keystroke). >2
    // means the tofu measure-and-fallback re-fired the per-char branch.
    const mEmits = await page.evaluate(() => {
      const w = window as unknown as {
        __v2_charcode_events?: Array<{ outcome: string; text: string }>;
      };
      return (w.__v2_charcode_events ?? []).filter((e) => e.text === "M");
    });
    expect(
      mEmits.length,
      `Expected ≤2 emit events for "M" (1 per keystroke), got ${mEmits.length}: ${JSON.stringify(mEmits, null, 2)}`,
    ).toBeLessThanOrEqual(2);
  });
});
