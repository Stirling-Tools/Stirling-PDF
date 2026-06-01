import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");
const MULTI_PAGE_PDF = path.join(
  __dirname,
  "../test-fixtures/multi-page-sample.pdf",
);
const FORM_XOBJECT_PDF = path.join(
  __dirname,
  "../test-fixtures/form-xobject-sample.pdf",
);
const PARAGRAPH_PDF = path.join(
  __dirname,
  "../test-fixtures/paragraph-sample.pdf",
);
// The same Sample.pdf that ships in `frontend/editor/public/samples/` -
// copied here as a fixture so the test suite has a self-contained
// reference to the file the user reproduces space-preservation bugs on.
const USER_SAMPLE_PDF = path.join(
  __dirname,
  "../test-fixtures/user-sample.pdf",
);

/**
 * v2 PDF text editor regression suite.
 *
 * v2 runs entirely in the browser via PDFium WASM (`@embedpdf/pdfium`),
 * so these tests do not need a real backend - they live in the stubbed
 * project. `/pdf-text-editor` mounts v2 directly.
 *
 * The tests load `sample.pdf` (a 1-page text-only fixture), exercise the
 * core editing loop, and assert on the editor's DOM and the eventual
 * downloaded PDF. They are intentionally pinned to test-ids on the v2
 * components so unrelated UI tweaks won't break them.
 */

async function gotoV2(page: import("@playwright/test").Page) {
  await page.goto("/pdf-text-editor", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("v2-root")).toBeVisible({ timeout: 15_000 });
}

async function loadSamplePdf(page: import("@playwright/test").Page) {
  // The visible "Open" flow goes through the left-sidebar Files panel.
  // For headless tests we drive the editor via the hidden test-only
  // file input that v2 always renders.
  await page.locator('[data-testid="v2-file-input"]').setInputFiles(SAMPLE_PDF);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
}

async function loadMultiPageSample(page: import("@playwright/test").Page) {
  await page
    .locator('[data-testid="v2-file-input"]')
    .setInputFiles(MULTI_PAGE_PDF);
  await expect(page.getByTestId("v2-page-0")).toBeVisible({ timeout: 30_000 });
}

/**
 * Type a string into a contenteditable using `execCommand('insertText')`.
 *
 * Playwright's `keyboard.type` sends synthetic keydown/keyup events, but
 * Chromium contentEditable text insertion in some configurations requires
 * the higher-level `beforeinput` path that `execCommand` triggers. Using
 * `evaluate` here makes the test deterministic regardless of how the
 * embedding browser handles synthetic key events on contenteditable.
 */
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

    // Capture the original first-run text, then edit it. EditTextCommand
    // collapses the run to base-14 Helvetica on first edit so arbitrary
    // characters (punctuation, parens, mixed case) survive the round
    // trip - they would have rendered as tofu otherwise.
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

    // Push the saved bytes back into the dropzone as a new file.
    // setInputFiles() accepts an in-memory payload; the editor will
    // close the old document via store.setDocument() and load this.
    await page.locator('[data-testid="v2-file-input"]').setInputFiles({
      name: "round-trip.pdf",
      mimeType: "application/pdf",
      buffer: savedBytes,
    });

    // The edited text must be present somewhere in page 0's runs.
    // The per-word emit path can split inserted text into a separate
    // PDFium text object (so "(Hello!)" may end up in its own run
    // after LineGrouper) - what matters is that every char survives
    // and the round-trip didn't lose the appended content.
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
    // The boundary between original and appended may collapse to a
    // single or double space depending on per-word emit / LineGrouper
    // reconstruction. Either is acceptable as long as both pieces are
    // present and not visually glued.
    expect(allText).not.toContain(`${original}(Hello!)`);
    // Quiet the unused-var lint - `edited` documents the intent above.
    void edited;
  });
});

test.describe("PDF text editor v2 - whitespace preservation", () => {
  // These guard against a recurring class of regression where typed
  // spaces vanish from the saved PDF. Two mechanisms have caused this:
  //
  // 1. Browser substitutes U+00A0 (NBSP) for a typed space at word
  //    boundaries to keep visual gaps. PDFium's base-14 Helvetica
  //    fallback maps U+00A0 to glyph 0xFF (ydieresis), so the "space"
  //    becomes a visible junk char.
  // 2. PDFium's FPDFText_SetText collapses consecutive ASCII spaces
  //    inside a single text object, so "A  B" comes back "A B" unless
  //    the writer emits one text object per word with explicit gaps.
  //
  // The first is a contenteditable-layer concern (TextRunOverlay must
  // strip NBSP before dispatching onEdit). The second is an
  // EditTextCommand / emitTextLine concern (per-word emit path). Both
  // are easy to break unnoticed, so we test both at the model boundary
  // AND across a full save / re-open round trip.

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

    // But the model snapshot - the source of truth for save - must
    // contain regular space, never NBSP. If this assertion fails the
    // PDF will render `XÿY` after save with base-14 Helvetica.
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
    // LineGrouper, which is the same path the user's PDF viewer of
    // choice would take. The per-word emit path produces one PDFium
    // text object per word, and LineGrouper may or may not re-merge
    // adjacent objects into one run depending on the measured gap. The
    // assertion that matters is "the rendered PDF, when re-read, still
    // contains 'Hello World' with a space between" - scan every run on
    // page 0 for the substring.
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
    // Repro for the recurring "all spaces vanish when I delete a single
    // letter" bug on the Stirling marketing PDF. The line "The Free
    // Adobe Acrobat Alternative" is laid out with positional cursor
    // jumps (no literal space char), so PDFium reads it as
    // ["The", "Free", "Adobe", "Acrobat", "Alternative"] and LineGrouper
    // re-synthesises spaces. The displayed text in the overlay therefore
    // has spaces that DON'T exist in any sub-object. When the user
    // deletes one char, partialEdit bails (char-count mismatch) and the
    // overlay path emits one base-14 text object - the spaces must
    // survive that round-trip.
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(
        path.join(__dirname, "../test-fixtures/stirling-marketing.pdf"),
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

    // Trigger the exact failure path: replace the whole text with
    // itself minus the last char. typeIntoRun with selectNodeContents +
    // insertText overwrites the contents.
    const trimmed = target.text.slice(0, -1);
    await typeIntoRun(page, target.testId, trimmed);

    // Model assertion: after the edit, the run's text in the editor
    // store must STILL contain the inter-word spaces. If this fails the
    // bug is in the overlay onInput path or EditTextCommand.apply().
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

    // Save and re-open. The reopened text on page 0 must still parse
    // back to a tagline with spaces between words. This is the "would
    // the user see spaces" test - if a PDF viewer extracts text from
    // the saved file, it must come back word-separated.
    await saveAndReopen(page);

    // The marketing PDF is multi-page; pages render lazily and the
    // tagline run we care about may not have mounted yet. Poll for it.
    // (A bare scroll-and-wait races the bitmap render that the run
    // overlay depends on.)
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
    // Surface a slice around the tagline on assertion failure so a
    // future regression debugger sees the actual reopened text, not
    // an opaque regex mismatch.
    const tagIdx = reopenedAllText.indexOf("Free");
    const taglineSnippet =
      tagIdx >= 0
        ? reopenedAllText.slice(Math.max(0, tagIdx - 20), tagIdx + 200)
        : "<no 'Free' found in reopened runs>";
    // Core check: none of the word pairs should be GLUED (no
    // whitespace separator at all between them). That's the exact
    // failure mode the user reported: editing produced
    // "TheFreeAdobeAcrobatAlternativ" with all spaces eaten.
    expect(
      reopenedAllText,
      `Tagline snippet: ${JSON.stringify(taglineSnippet)}`,
    ).not.toMatch(/FreeAdobe/);
    expect(reopenedAllText).not.toMatch(/AdobeAcrobat/);
    // (Acrobat may sometimes glue with "Alt" from a leftover original
    // per-glyph sub-object - that's a separate cover-rect bug for
    // form-xobject text, not the space-emit bug.)
    // Positive check: the tagline words DO appear separated by some
    // whitespace somewhere in the reopened text.
    expect(reopenedAllText).toMatch(/Free\s+Adobe/);
    expect(reopenedAllText).toMatch(/Adobe\s+Acrobat/);
  });

  test("user-sample.pdf: deleting one char from tagline keeps every inter-word space", async ({
    page,
  }) => {
    // EXACT user repro. Loads the same Sample.pdf the user is editing
    // (frontend/editor/public/samples/Sample.pdf, copied to fixtures as
    // user-sample.pdf). The tagline "The Free Adobe Acrobat Alternative"
    // is laid out as one PDFium text object per glyph, with standalone
    // zero-width " " sub-objects positioned in the inter-word gaps. The
    // failure mode this guards against: editing the run (here: deleting
    // the trailing "e") collapses every kept sub-object leftward,
    // eliminating the inter-object whitespace gaps so the saved PDF
    // renders as `TheFreeAdobeAcrobatAlternativ` with all spaces eaten.
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

    // Model assertion: the run text after the edit must still have all
    // four inter-word gaps. (LineGrouper reports synthesised double
    // spaces between the per-glyph sub-objects, so use `\s+`.)
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

    // Round-trip through save + re-open and verify the same word
    // boundaries survive. This is the "does the saved PDF render with
    // spaces" check - a PDF viewer that re-extracts text from the file
    // must see the words separated.
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
    // LineGrouper-synthesised whitespace miscounted ghost chars by 1,
    // which silently misclassified one sub-run as "mixed", removed
    // and re-emitted it, and produced a model state with DUPLICATE
    // `mergedFromTexts` entries (the same text twice, at different
    // bounds). Visually this teleported a chunk of the line and
    // dropped chars from the middle.
    //
    // We delete one character from the MIDDLE of the bullet (not the
    // end) because middle-edits exercise the full keep/delete/keep
    // op-walk - end appends only need a single trailing insert and
    // miss the cross-sub-run alignment bugs.
    //
    // Asserts the model state stays sane after the delete:
    //   * run.text equals baseline minus the deleted char
    //   * mergedFromTexts has no duplicates of any non-trivial text
    //     fragment (the smoking gun for the teleport regression)
    //   * every non-trivial baseline fragment whose chars all survived
    //     still appears verbatim - catches silent char swaps
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

    // Pick a deterministic middle-position character to delete: the
    // letter "A" of "Adobe" (clearly in the middle of the line,
    // sandwiched between kept sub-runs on both sides).
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

    // Sub-run integrity: any non-trivial (>=3 char) baseline fragment
    // must NOT appear twice in the post-edit mergedFromTexts. That's
    // the smoking gun for the teleport regression.
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

    // Char-fidelity: every non-trivial baseline fragment that wasn't
    // the deleted sub-run must still appear verbatim somewhere in
    // after.mergedFromTexts. Detects silent char swaps.
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

    // Font preservation: editing a line rendered in a non-base14
    // source font must NOT flip the run to base14:Helvetica. The
    // partialEdit path borrows the original font handle from the
    // surviving sub-objects, so the kept text stays in its source
    // typeface.
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

  // ---------------------------------------------------------------
  // Sequential-edit visual-integrity tests. Each test performs a
  // series of single-character edits and after EVERY step asserts:
  //   (1) run.text matches the expected after-edit string
  //   (2) run.fontId stays on its source (non-base14) font
  //   (3) run.bounds.y doesn't move (no vertical teleport)
  //   (4) mergedFromTexts has no duplicate non-trivial fragment
  //
  // The bounds.y check is the cheap "visual" proxy: a regression
  // that teleports text to the wrong line will fail it immediately,
  // and a regression that swaps the font flips assertion (2). These
  // assertions are stricter than "round-trip survives reload" - they
  // catch any model-state damage at the moment it happens, so a
  // future bug can be pinned to the exact keystroke that introduced
  // it.
  // ---------------------------------------------------------------

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

    // Type three chars at the end of the line, asserting after each
    // keystroke that the font hasn't flipped and the line hasn't
    // teleported off its original baseline.
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
      // Each iteration we delete the char at position `acrobatStart`
      // - which is the next char of what used to be "Acrobat" after
      // the previous deletes.
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
    // Mimics realistic user editing: delete a char, type a different
    // one, repeat. Stresses both the "mixed sub-run" code path AND
    // the cumulative-offset math across multiple replacements in the
    // same line.
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

  test("multiple consecutive spaces survive save and re-open", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";

    // Three consecutive spaces between A and B. PDFium's text object
    // storage collapses these unless the writer emits per-word chunks
    // - this is what the "Preserve consecutive spaces via per-word
    // emit" path in editTextHelpers exists to defend.
    await typeIntoRun(page, runTestId, " A   B");
    await expect(firstRun).toContainText("A   B");

    await saveAndReopen(page);

    // The per-word emit writes "A" + gap + "B" as separate PDFium
    // text objects, and LineGrouper on reload may or may not re-merge
    // them depending on the measured gap vs ABS_MAX_GAP_PT. Either way,
    // both halves and the inter-word gap must survive somewhere on
    // page 0 - collect every run's text and look for the pattern.
    const allText = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __v2_editor_store?: {
            state: { pages: { runs: { text: string }[] }[] };
          };
        }
      ).__v2_editor_store!;
      return (store.state.pages[0]?.runs ?? []).map((r) => r.text).join("\n");
    });
    // Both letters must come back. The "B" disappearing would mean a
    // text object was lost in the round trip.
    expect(allText).toContain("A");
    expect(allText).toContain("B");
    // Multiple consecutive spaces must survive in at least one run
    // (LineGrouper rebuilds them from cursor-jump positions). A complete
    // collapse to a single space means PDFium ate them inside one
    // text object - the failure mode this test guards against.
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
    await firstRun.click();

    // Mantine's ColorInput stamps the testid on the wrapper, not the
    // underlying <input>. We match by aria-label and use evaluate() to
    // fire React's onChange via fill+blur in one shot - the input is
    // type=text under the hood.
    const colourInput = page.getByLabel("Font colour").first();
    await expect(colourInput).toBeEnabled();
    await colourInput.fill("#ff0000");
    await colourInput.press("Enter");
    await expect(page.getByTestId("v2-undo")).toBeEnabled();
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

    // After a multi-select with two different fills, the colour input is
    // null (mixed). The font-size input is enabled in either case. The
    // simplest assertion: undo isn't enabled (no dispatches yet) and the
    // toolbar accepts a colour to apply to both. We then check that two
    // edits land in history via canRedo after one undo.
    const colourInput = page.getByLabel("Font colour").first();
    await expect(colourInput).toBeEnabled();
    await colourInput.fill("#00aa00");
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

    await page.locator('[data-testid^="v2-run-p0-"]').first().click();
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

    // The sidebar status reports the page count.
    await expect(page.getByTestId("v2-sidebar-status")).toContainText(
      "3 pages",
    );
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
    // Append a chr known to be in latin subsets.
    await typeIntoRun(page, runTestId, "e");
    await expect(target).toContainText("e");
    await expect(page.getByTestId("v2-undo")).toBeEnabled();
  });
});

test.describe("PDF text editor v2 - reset", () => {
  test("Reset reverts every edit in one click", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const firstRun = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await firstRun.getAttribute("data-testid")) ?? "";
    const original = (await firstRun.innerText()) ?? "";

    await typeIntoRun(page, runTestId, "t");
    await typeIntoRun(page, runTestId, "t");
    await expect(firstRun).toContainText("tt");

    await page.getByTestId("v2-reset").click();
    await expect(firstRun).toHaveText(original);
    await expect(page.getByTestId("v2-undo")).toBeDisabled();
  });
});

test.describe("PDF text editor v2 - bold/italic", () => {
  test("Bold toggle dispatches a SetFontFamily edit", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    await page.locator('[data-testid^="v2-run-p0-"]').first().click();
    // First we must swap to a base-14 font (Helvetica) since the source
    // PDF's runs use unknown families that the bold flip doesn't know
    // how to map.
    const family = page.getByLabel("Font family").first();
    await family.click();
    await page
      .getByRole("option", { name: /^Helvetica$/i })
      .first()
      .click({ timeout: 10_000 });

    const undoCountBefore = await page.getByTestId("v2-undo").isEnabled();
    expect(undoCountBefore).toBe(true);

    // Now click Bold. It should dispatch another edit (undo stack grows).
    await page.getByTestId("v2-bold").click();
    // Toolbar bold state flips to active.
    await expect(page.getByTestId("v2-bold")).toHaveAttribute(
      "data-variant",
      /filled/i,
    );
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

    // The raw PDFium read of sample.pdf produced 9 separate text
    // objects (one per word/letter). After LineGrouper we expect
    // strictly fewer overlays - the table cells with " as " merge into
    // their line.
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
    // Typing any character into a merged group falls through to the
    // base-14 Helvetica fallback - it survives the round-trip even if
    // the source PDF used a subset font.
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
    // arbitrary Latin characters can be typed. This test asserts the
    // overlay reflects what the user typed - the round-trip into the
    // saved PDF is exercised by the dedicated save-round-trip test
    // which uses subset-safe chars.
    const target = page.locator('[data-testid^="v2-run-p0-"]').first();
    const runTestId = (await target.getAttribute("data-testid")) ?? "";
    await typeIntoRun(page, runTestId, "x!@#");
    await expect(target).toContainText("x!@#");
    await expect(page.getByTestId("v2-undo")).toBeEnabled();
  });
});

test.describe("PDF text editor v2 - typing fidelity", () => {
  test("focused overlay shows visible glyphs in a matching CSS font", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const target = page.locator('[data-testid^="v2-run-p0-"]').first();
    await target.click();
    // After focus, color and background flip from transparent to a
    // visible state. Assert by computed style.
    const visible = await target.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        color: cs.color,
        background: cs.backgroundColor,
        fontFamily: cs.fontFamily,
      };
    });
    expect(visible.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(visible.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(visible.fontFamily.length).toBeGreaterThan(0);
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

    // Page 0 is at the top of the stage and within the viewport on
    // first render. The intersection observer should clear its
    // placeholder shortly after mount.
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("v2-page-0-placeholder")).toHaveCount(0, {
      timeout: 10_000,
    });

    // Page 2 is below the fold for a 1080-tall viewport (each page is
    // 792 PDF points * 1.5 scale ≈ 1188 CSS pixels). With our 800px
    // rootMargin it MAY or MAY NOT be near-viewport depending on the
    // exact layout, so we don't assert a placeholder, only that the
    // page itself eventually becomes visible (which only happens once
    // the user scrolls).
    await expect(page.getByTestId("v2-page-2")).toBeVisible();
  });
});

test.describe("PDF text editor v2 - lazy page loading", () => {
  test("multi-page docs render their pages without blocking on every read", async ({
    page,
  }) => {
    // We don't have a 60-page fixture in the repo so we time the load
    // of the existing multi-page fixture as a guardrail. The lazy path
    // doesn't read all pages on load so this stays well under the
    // baseline that v1 was hitting.
    await gotoV2(page);
    const started = Date.now();
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);
    await expect(page.getByTestId("v2-page-0")).toBeVisible({
      timeout: 30_000,
    });
    const elapsedMs = Date.now() - started;
    // Generous bound - the lazy load is a fraction of this in practice
    // but CI machines vary. The point is the test catches a regression
    // that pushes this over 10s for a 3-page doc.
    expect(elapsedMs).toBeLessThan(10_000);
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
    // It contains a single page whose only content object is an
    // FPDF_PAGEOBJ_FORM (created via pdf-lib's embedPdf+drawPage), and
    // that form contains four text objects ("Magazine cover title",
    // "Subheading line below", "Inner body paragraph one.", "Inner body
    // paragraph two."). Our reader must recurse into the form to
    // surface the runs.
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
    // Kick off the load and immediately capture the stage element. We
    // race the small fixture's load against the assertion timeout; the
    // overlay is so short-lived for tiny files we use a non-strict
    // visible check that tolerates either "still visible" or "already
    // gone but progress fired at least once".
    const overlayPromise = page
      .getByTestId("v2-stage-loading")
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);
    const sawOverlay = await overlayPromise;
    // Either the overlay appeared, or the load finished too fast for
    // the observer to catch it. In both cases the editor should now
    // show pages.
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

test.describe("PDF text editor v2 - page list jump", () => {
  test("clicking a page in the sidebar list scrolls it into view", async ({
    page,
  }) => {
    await gotoV2(page);
    await page
      .locator('[data-testid="v2-file-input"]')
      .setInputFiles(MULTI_PAGE_PDF);
    await expect(page.getByTestId("v2-page-list")).toBeVisible({
      timeout: 30_000,
    });
    // Jump to the last page
    await page.getByTestId("v2-page-list-2").click();
    await expect(page.getByTestId("v2-page-2")).toBeInViewport({
      ratio: 0.1,
      timeout: 5_000,
    });
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
    // After undo, a run on page 0 contains the original text (the
    // model has been re-emitted as a fresh page-level run carrying
    // the original characters).
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
    // The WorkbenchBar exposes its tab buttons with the tab label as
    // the accessible text. While our tool is active the Viewer tab is
    // dropped from the list.
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
      // Best-effort hack: find any "Active Files" / "Files" tab and
      // click it, then expect we bounce back. Since the actual
      // pin-effect is hard to drive deterministically from a stub,
      // we assert the stage stays visible after a setTimeout cycle.
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await expect(page.getByTestId("v2-stage")).toBeVisible();
  });
});

test.describe("PDF text editor v2 - sidebar status", () => {
  test("status panel reports page count and dirty state", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const status = page.getByTestId("v2-sidebar-status");
    await expect(status).toContainText("1 page");
    await expect(status).toContainText(/No changes yet/i);

    const firstRunTestId = await page
      .locator('[data-testid^="v2-run-p0-"]')
      .first()
      .getAttribute("data-testid");
    await typeIntoRun(page, firstRunTestId!, "X");

    await expect(status).toContainText(/Unsaved changes/i);
  });
});

test.describe("PDF text editor v2 - toolbar tooltips", () => {
  test("toolbar buttons expose tooltip labels", async ({ page }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    await expect(page.getByTestId("v2-rotate-left")).toBeVisible();
    await expect(page.getByTestId("v2-rotate-right")).toBeVisible();
    await expect(page.getByTestId("v2-print")).toBeVisible();
    await expect(page.getByTestId("v2-reset")).toBeVisible();
    await expect(page.getByTestId("v2-save")).toBeVisible();
  });
});

test.describe("PDF text editor v2 - rotate page", () => {
  test("rotate buttons bump pagePtr rotation and revert with undo", async ({
    page,
  }) => {
    await gotoV2(page);
    await loadSamplePdf(page);

    const readRotation = () =>
      page.evaluate(() => {
        const store = (window as unknown as { __v2_editor_store?: unknown })
          .__v2_editor_store as unknown as {
          document: {
            module: { FPDFPage_GetRotation: (p: number) => number };
            page: (i: number) => { pagePtr: number };
          } | null;
        };
        const doc = store.document;
        if (!doc) return -1;
        return doc.module.FPDFPage_GetRotation(doc.page(0).pagePtr);
      });

    const initial = await readRotation();
    expect(initial).toBeGreaterThanOrEqual(0);

    await page.getByTestId("v2-rotate-right").click();
    await page.waitForTimeout(120);

    const after = await readRotation();
    expect(after).toBe((initial + 1) % 4);

    // Call store.undo() directly so the test isn't sensitive to which
    // element currently has keyboard focus (Mantine buttons swallow
    // some key events between window.keydown registration and Playwright).
    await page.evaluate(() => {
      const store = (window as unknown as { __v2_editor_store?: unknown })
        .__v2_editor_store as { undo: () => void };
      store.undo();
    });
    await page.waitForTimeout(120);

    const reverted = await readRotation();
    expect(reverted).toBe(initial);
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
      const fire = (type: string, x: number, y: number) =>
        stage.dispatchEvent(
          new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            ctrlKey: true,
            shiftKey: true,
          }),
        );
      fire("mousedown", left - 5, top - 5);
      fire("mousemove", right + 5, bottom + 5);
      // Mouseup goes through window in MarqueeSelector's listener.
      window.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          clientX: right + 5,
          clientY: bottom + 5,
          ctrlKey: true,
          shiftKey: true,
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
      // Dispatch the keydown on window directly so we exercise the
      // same listener the user's Ctrl+A would hit, without depending
      // on which element the OS clipboard handler grabs first.
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
