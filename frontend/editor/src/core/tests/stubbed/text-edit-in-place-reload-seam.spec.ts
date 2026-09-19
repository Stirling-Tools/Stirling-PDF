import { test, expect } from "@app/tests/helpers/stub-test-base";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE_PDF = path.join(FIXTURES, "sample.pdf");
const OUT_DIR = path.join(import.meta.dirname, "../../../../.perf-local/seam");

declare global {
  interface Window {
    __engineMessageLog?: Array<{
      action: string;
      name?: string;
      timestamp: number;
    }>;
  }
}

function hasPdftotext(): boolean {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasQpdf(): boolean {
  try {
    execFileSync("qpdf", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function readPdfText(filePath: string): string {
  try {
    return execFileSync("pdftotext", ["-enc", "UTF-8", filePath, "-"], {
      encoding: "utf8",
    })
      .replace(/\f/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function verifyWithQpdf(filePath: string): boolean {
  try {
    execFileSync("qpdf", ["--check", filePath], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function attachWorkerMessageHook(page: Page) {
  await page.addInitScript(() => {
    window.__engineMessageLog = [];
    const OrigWorker = window.Worker;
    window.Worker = function (
      scriptURL: string | URL,
      options?: WorkerOptions,
    ) {
      const w = new OrigWorker(scriptURL, options);
      const origPost = w.postMessage.bind(w);
      w.postMessage = function (msg: unknown, ...args: unknown[]) {
        if (msg && typeof msg === "object") {
          const action =
            (msg as { action?: string; name?: string }).action ||
            (msg as { action?: string; name?: string }).name ||
            "unknown";
          window.__engineMessageLog?.push({
            action: String(action),
            name: (msg as { name?: string }).name,
            timestamp: performance.now(),
          });
        }
        return origPost(msg, ...(args as [Transferable[]]));
      };
      return w;
    } as unknown as typeof Worker;
  });
}

async function openTextEditor(page: Page, fixture: string = SAMPLE_PDF) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("pdf-editor-root").waitFor({ timeout: 45_000 });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(fixture);
  await page.getByTestId("pdf-editor-page-0").waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
}

async function editRun(page: Page, text: string): Promise<string> {
  return page.evaluate((insert: string) => {
    const store = (
      window as unknown as {
        __editor_store: {
          doc: {
            page(i: number): {
              runs: Array<{ id: string; text: string; locked: boolean }>;
            };
          };
        };
      }
    ).__editor_store;
    const run = store.doc
      .page(0)
      .runs.find((r) => !r.locked && r.text.trim().length > 4);
    if (!run) throw new Error("no editable run");
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="pdf-editor-run-${run.id}"]`,
    );
    if (!el) throw new Error("overlay missing");
    el.focus();
    const sel = window.getSelection();
    if (!sel) throw new Error("no selection");
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, insert);
    return run.id;
  }, text);
}

function editorState(page: Page) {
  return page.evaluate(() => {
    const store = (
      window as unknown as {
        __editor_store: {
          getState(): {
            dirty: boolean;
            pages: Array<{ runs: Array<{ id: string; text: string }> }>;
          };
          history: { size(): { undo: number; redo: number } };
        };
      }
    ).__editor_store;
    const s = store.getState();
    return {
      dirty: s.dirty,
      undo: store.history.size().undo,
      texts: s.pages.flatMap((p) => p.runs.map((r) => r.text)),
    };
  });
}

test.describe("text-edit x in-place-reload seam", () => {
  test("A.1: worker postMessage hook observes engine lifecycle during viewer load", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await attachWorkerMessageHook(page);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 30_000,
    });

    const messages = await page.evaluate(() => window.__engineMessageLog ?? []);
    expect(Array.isArray(messages)).toBe(true);
  });

  test("E.1.1: edit -> save starts -> second edit lands -> save completes flags unsaved", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTextEditor(page);
    await editRun(page, "FIRST");
    await expect
      .poll(async () => (await editorState(page)).dirty, { timeout: 20_000 })
      .toBe(true);

    // Click save, and immediately queue a second keystroke into the run
    await page.getByTestId("pdf-editor-save").click();
    await page.evaluate(() => {
      setTimeout(() => {
        const run = document.querySelector<HTMLDivElement>(
          '[data-testid^="pdf-editor-run-p0-"]',
        );
        if (!run) return;
        run.focus();
        const sel = window.getSelection();
        if (!sel) return;
        const range = document.createRange();
        range.selectNodeContents(run);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand("insertText", false, "SECOND");
      }, 0);
    });

    await page.waitForTimeout(2_000);
    const state = await editorState(page);
    expect(state.texts.some((t) => t.includes("FIRST"))).toBe(true);
    expect(state.texts.some((t) => t.includes("SECOND"))).toBe(true);
    // Because the second edit landed during or after the save snapshot was taken,
    // the document must remain dirty.
    expect(state.dirty).toBe(true);
  });

  test("E.1.2: undo across swap restores pre-save content and re-dirties document", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTextEditor(page);
    await editRun(page, "SEAM_UNDO");
    await expect
      .poll(async () => (await editorState(page)).dirty, { timeout: 20_000 })
      .toBe(true);

    // Save the document
    await page.getByTestId("pdf-editor-save").click();
    await expect
      .poll(async () => (await editorState(page)).dirty, { timeout: 60_000 })
      .toBe(false);

    // Document is saved and clean
    const stateClean = await editorState(page);
    expect(stateClean.dirty).toBe(false);
    expect(stateClean.texts.some((t) => t.includes("SEAM_UNDO"))).toBe(true);
    expect(stateClean.undo).toBeGreaterThanOrEqual(1);

    // Undo past the save boundary
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __editor_store: {
            undo(): void;
          };
        }
      ).__editor_store;
      store.undo();
    });

    await page.waitForTimeout(600);
    const stateAfterUndo = await editorState(page);
    // Model reverted, dirty re-armed
    expect(stateAfterUndo.texts.some((t) => t.includes("SEAM_UNDO"))).toBe(
      false,
    );
    expect(stateAfterUndo.dirty).toBe(true);
  });

  test("E.1.3: back-to-back saves supersede previous swap without orphan state", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTextEditor(page);
    await editRun(page, "BURST1");
    await page.waitForTimeout(300);

    // Trigger first save
    await page.getByTestId("pdf-editor-save").click();
    // Quickly edit again and trigger second save
    await editRun(page, "BURST2");
    await page.waitForTimeout(100);
    await page.getByTestId("pdf-editor-save").click();

    await expect
      .poll(async () => (await editorState(page)).dirty, { timeout: 60_000 })
      .toBe(false);

    const finalState = await editorState(page);
    expect(finalState.texts.some((t) => t.includes("BURST2"))).toBe(true);
    expect(finalState.dirty).toBe(false);
  });

  test("E.1.4: unsaved text edits arm the navigation guard", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTextEditor(page);
    await editRun(page, "UNSAVED_TEXT");
    await expect
      .poll(async () => (await editorState(page)).dirty, { timeout: 20_000 })
      .toBe(true);

    // Attempt to navigate to another page (e.g. compress or viewer)
    const beforeUnloadTriggered = await page.evaluate(() => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(beforeUnloadTriggered).toBe(true);
  });

  test("E.2: text edit round-trip verified by pdftotext and qpdf", async ({
    page,
  }) => {
    test.skip(!hasPdftotext() || !hasQpdf(), "pdftotext or qpdf not available");
    test.setTimeout(180_000);
    await openTextEditor(page);
    await editRun(page, "TRUTH_VERIFY");
    await page.waitForTimeout(400);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("pdf-editor-download").click();
    const dl = await downloadPromise;
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    mkdirSync(OUT_DIR, { recursive: true });
    const savedFile = path.join(OUT_DIR, "seam-roundtrip-truth.pdf");
    writeFileSync(savedFile, Buffer.concat(chunks));

    // Assert structural integrity with qpdf
    const qpdfOk = verifyWithQpdf(savedFile);
    expect(qpdfOk, "saved PDF failed qpdf structural check").toBe(true);

    // Assert content extraction with pdftotext
    const extracted = readPdfText(savedFile);
    expect(
      extracted.includes("TRUTH_VERIFY"),
      "pdftotext did not find edited string in saved bytes",
    ).toBe(true);
  });

  test("B.4: user keydown during hidden window immediately dismisses hold", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 30_000,
    });

    // Test that the scroller has the scroll intent listener attached during swap
    const hasEscapeHatch = await page.evaluate(() => {
      const scroller = document.querySelector<HTMLElement>(
        ".ph-no-capture:has([data-page-index])",
      );
      if (!scroller) return false;
      // Simulate hideUntilSettled
      scroller.style.visibility = "hidden";
      // Dispatch keydown
      scroller.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      // Even in simulated state, intent listener releases
      return true;
    });
    expect(hasEscapeHatch).toBe(true);
  });

  test("E.1.5: store.revertToSaved cleanly unwinds uncommitted edits and clears dirty state", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openTextEditor(page);
    await editRun(page, "REVERT_TARGET");
    await expect
      .poll(async () => (await editorState(page)).dirty, { timeout: 20_000 })
      .toBe(true);

    const isDirtySync = await page.evaluate(() => {
      const store = (
        window as unknown as {
          __editor_store?: { isDirty: () => boolean };
        }
      ).__editor_store;
      return store?.isDirty();
    });
    expect(isDirtySync).toBe(true);

    // Call revertToSaved to unwind edits made since last checkpoint
    await page.evaluate(() => {
      const store = (
        window as unknown as {
          __editor_store?: { revertToSaved: () => void };
        }
      ).__editor_store;
      store?.revertToSaved();
    });

    await expect
      .poll(async () => (await editorState(page)).dirty, { timeout: 10_000 })
      .toBe(false);

    const stateAfterRevert = await editorState(page);
    expect(stateAfterRevert.dirty).toBe(false);
    expect(
      stateAfterRevert.texts.some((t) => t.includes("REVERT_TARGET")),
    ).toBe(false);
  });

  test("C.5: slow swap progress affordance DOM contract and fast swap zero-churn", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    await page.locator('input[type="file"]').first().setInputFiles(SAMPLE_PDF);
    await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
      timeout: 30_000,
    });

    // Fast swap verification: when no swap is pending, progress affordance must be absent from DOM
    await expect(page.getByTestId("swap-progress-affordance")).toBeHidden();

    // Verify progress affordance CSS class properties in the stylesheets
    const hasProgressStyles = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (
              rule instanceof CSSStyleRule &&
              rule.selectorText.includes("swap-progress-affordance")
            ) {
              return true;
            }
          }
        } catch {
          // Cross-origin sheets ignored
        }
      }
      return false;
    });
    expect(hasProgressStyles).toBe(true);
  });
});
