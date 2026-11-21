import fs from "fs";
import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";
import { waitForEditorReady } from "@editor/tests/stubbed/editorReady";
import { reopenSavedBytes } from "@editor/tests/stubbed/saveHelpers";

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");
const REOPENS = 25;
const HEAP_GROWTH_LIMIT = 32 * 1024 * 1024; // 32 MB

type EditorWindow = Window & { __editor_store: EditorStore };

const wasmHeapBytes = (page: Page) =>
  page.evaluate(() => {
    const doc = (window as unknown as EditorWindow).__editor_store.document;
    const exports = doc?.module.pdfium.wasmExports as unknown as
      | { memory: WebAssembly.Memory }
      | undefined;
    return exports?.memory.buffer.byteLength ?? 0;
  });

test.describe("PDF text editor - reopening files in one tab", () => {
  test.setTimeout(240_000);

  test("survives reopening the same file many times with the heap bounded", async ({
    page,
  }) => {
    const bytes = fs.readFileSync(SAMPLE);
    const crash = new Promise<never>((_, reject) =>
      page.once("crash", () => reject(new Error("the tab crashed"))),
    );
    const open = (name: string) =>
      Promise.race([
        reopenSavedBytes(page, bytes, name).then(() =>
          waitForEditorReady(page),
        ),
        crash,
      ]);
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });

    await open("sample.pdf");
    const firstHeap = await wasmHeapBytes(page);

    for (let reopen = 1; reopen <= REOPENS; reopen++) {
      await open(`sample-${reopen}.pdf`);
    }

    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible();
    expect(await wasmHeapBytes(page)).toBeLessThan(
      firstHeap + HEAP_GROWTH_LIMIT,
    );
  });
});
