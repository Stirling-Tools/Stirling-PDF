// Swap-seam guard for the text editor: what must stay true when a save
// replaces the workbench file's bytes (today via consumeFiles, tomorrow via the
// in-place hot reload). A reload that reopens the document instead of adopting
// it breaks these, so they are the regression net for that work.
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");
const OUT_DIR = path.join(import.meta.dirname, "../../../../.perf-local/seam");

async function openEditor(page: Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("pdf-editor-root").waitFor({ timeout: 45_000 });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE);
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

function hasPdftotext(): boolean {
  try {
    execFileSync("pdftotext", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function savedText(file: string): string | null {
  try {
    return execFileSync("pdftotext", ["-enc", "UTF-8", file, "-"], {
      encoding: "utf8",
    })
      .replace(/\f/g, "")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return null;
  }
}

test("save keeps undo history, caret ownership, and workspace coherence", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openEditor(page);
  const runId = await editRun(page, "SEAM1");
  // Store truth, not the marker: the dot is a span, and dirty is what the
  // swap must keep coherent anyway.
  await expect
    .poll(async () => (await editorState(page)).dirty, { timeout: 20_000 })
    .toBe(true);

  await page.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="pdf-editor-run-${id}"]`,
    );
    if (el) (el as unknown as { __seamMark?: number }).__seamMark = 1;
  }, runId);

  await page.getByTestId("pdf-editor-save").click();
  await expect
    .poll(async () => (await editorState(page)).dirty, { timeout: 60_000 })
    .toBe(false);

  const afterSave = await editorState(page);
  // The edited run is still the same run, with the edit in it.
  expect(afterSave.texts.some((t) => t.includes("SEAM1"))).toBe(true);
  // History survives the write-back: undo is still available and reverts.
  expect(afterSave.undo).toBeGreaterThanOrEqual(1);
  expect(afterSave.dirty).toBe(false);

  // The write-back must not remount the editor. An expando set before the save
  // survives only if the overlay NODE is the same one, and the run id must be
  // the same model object the history refers to.
  const sameNode = await page.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="pdf-editor-run-${id}"]`,
    );
    return el
      ? (el as unknown as { __seamMark?: number }).__seamMark === 1
      : false;
  }, runId);
  expect(
    sameNode,
    "save replaced the overlay DOM node (editor remounted)",
  ).toBe(true);
  const stillEditable = await page.evaluate((id: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-testid="pdf-editor-run-${id}"]`,
    );
    return !!el && el.isContentEditable;
  }, runId);
  expect(stillEditable, "the saved run is no longer editable").toBe(true);

  // Typing after the save still reaches the model.
  await page.evaluate((id: string) => {
    const el = document.querySelector<HTMLDivElement>(
      `[data-testid="pdf-editor-run-${id}"]`,
    );
    if (!el) throw new Error("run gone after save");
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand("insertText", false, "POST");
  }, runId);
  await page.waitForTimeout(500);
  expect(
    (await editorState(page)).texts.some((t) => t.includes("POST")),
    "typing after save did not reach the model",
  ).toBe(true);

  // Two steps now: the pre-save edit and the post-save typing. Undo until the
  // pre-save edit is gone; if history had been reset by the write-back this
  // loop would run to its cap and the assertion below would fail.
  await page.evaluate(() => {
    const store = (
      window as unknown as {
        __editor_store: {
          getState(): {
            pages: Array<{ runs: Array<{ text: string }> }>;
          };
          undo(): void;
        };
      }
    ).__editor_store;
    for (let i = 0; i < 10; i += 1) {
      const hasSeam = store
        .getState()
        .pages.flatMap((p) => p.runs)
        .some((r) => r.text.includes("SEAM1"));
      if (!hasSeam) break;
      store.undo();
    }
  });
  await page.waitForTimeout(500);
  const afterUndo = await editorState(page);
  expect(afterUndo.texts.some((t) => t.includes("SEAM1"))).toBe(false);
  expect(afterUndo.dirty).toBe(true);
});

test("an edit that lands during save is either saved or flagged unsaved, never dropped silently", async ({
  page,
}) => {
  test.skip(
    !hasPdftotext(),
    "pdftotext not installed: cannot judge the saved bytes",
  );
  test.setTimeout(180_000);
  await openEditor(page);
  await editRun(page, "SEAM2");
  await page.waitForTimeout(400);

  // Queue the late keystroke INTO THE RUN during the save's yield window, so
  // the race is genuinely exercised instead of landing on a button.
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-download").click();
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
      document.execCommand("insertText", false, "LATE");
    }, 0);
  });
  const dl = await downloadPromise;
  const stream = await dl.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, "seam-late.pdf");
  writeFileSync(file, Buffer.concat(chunks));
  await page.waitForTimeout(1200);

  const state = await editorState(page);
  const modelHasSeam = state.texts.some((t) => t.includes("SEAM2"));
  const modelHasLate = state.texts.some((t) => t.includes("LATE"));
  const bytes = savedText(file) ?? "";
  const inBytes = bytes.includes("LATE");
  expect(modelHasSeam, "the pre-save edit vanished from the model").toBe(true);

  // The rule: bytes and dirty must agree. If LATE reached the map the model is
  // clean; if it did not, the document must still be flagged unsaved.
  if (modelHasLate && !inBytes) {
    expect(
      state.dirty,
      "late edit missing from bytes but the editor reported a clean save",
    ).toBe(true);
  } else {
    expect(
      state.dirty,
      "saved bytes and model agree, but the editor stayed dirty",
    ).toBe(false);
  }
  console.log(
    `[seam] model SEAM2=${modelHasSeam} LATE=${modelHasLate} bytesLATE=${inBytes} dirty=${state.dirty}`,
  );
});
