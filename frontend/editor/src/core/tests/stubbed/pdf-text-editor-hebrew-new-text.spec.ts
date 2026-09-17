import { expect, test } from "@app/tests/helpers/stub-test-base";
import path from "path";
import type { EditorTestWindow } from "@app/tests/stubbed/editorTestTypes";

const SAMPLE = path.join(
  import.meta.dirname,
  "../../../../public/samples/Sample.pdf",
);

function hebrewCharacters(text: string) {
  return Array.from(text)
    .filter((character) => /\p{Script=Hebrew}/u.test(character))
    .sort()
    .join("");
}

async function openEditor(page: import("@playwright/test").Page) {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(SAMPLE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
}

test("new text boxes keep Hebrew through edit, save, and reopen", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await openEditor(page);
  // The shared stub harness intentionally returns 401 for optional account
  // requests during startup; the edit itself must remain console-clean.
  consoleErrors.length = 0;
  await page.getByTestId("pdf-editor-add-text").click();
  await page
    .getByTestId("pdf-editor-page-0")
    .click({ position: { x: 360, y: 260 } });

  const run = page
    .locator('[data-testid^="pdf-editor-run-"]')
    .filter({ hasText: "New text" })
    .first();
  await expect(run).toBeVisible();
  await run.evaluate((element) => {
    element.focus();
    const selection = window.getSelection();
    if (!selection) throw new Error("selection unavailable");
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, "שלום עברית");
  });

  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = (window as unknown as EditorTestWindow).__editor_store;
        const live = store.doc
          .page(0)
          .runs.find((item) => item.text.includes("שלום"));
        return live ? { text: live.text, width: live.bounds.width } : null;
      }),
    )
    .toEqual({ text: "שלום עברית", width: expect.any(Number) });

  const model = await page.evaluate(() => {
    const store = (window as unknown as EditorTestWindow).__editor_store;
    const live = store.doc
      .page(0)
      .runs.find((item) => item.text.includes("שלום"));
    return {
      text: live?.text,
      width: live?.bounds.width,
      rendered: document.body.innerText.includes("שלום עברית"),
    };
  });
  expect(model.text).toBe("שלום עברית");
  expect(model.width).toBeGreaterThan(0);
  expect(model.rendered).toBe(true);
  expect(
    consoleErrors.filter(
      (error) =>
        !error.includes("Failed to load resource") &&
        !error.includes("ERR_CONNECTION_RESET"),
    ),
  ).toEqual([]);

  consoleErrors.length = 0;
  await page.getByTestId("pdf-editor-save").click();
  await expect(page.getByTestId("pdf-editor-save")).toBeEnabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-download").click();
  const download = await downloadPromise;
  const savedPath = await download.path();
  if (!savedPath) throw new Error("saved PDF download has no path");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 15_000,
  });
  await page
    .locator('[data-testid="pdf-editor-file-input"]')
    .setInputFiles(savedPath);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = (window as unknown as EditorTestWindow).__editor_store;
        const text = store.doc
          .page(0)
          .runs.map((item) => item.text)
          .find((item) => /\p{Script=Hebrew}/u.test(item));
        return text
          ? Array.from(text)
              .filter((character) => /\p{Script=Hebrew}/u.test(character))
              .sort()
              .join("")
          : null;
      }),
    )
    .toBe(hebrewCharacters("שלום עברית"));
  expect(
    consoleErrors.filter(
      (error) =>
        !error.includes("Failed to load resource") &&
        !error.includes("ERR_CONNECTION_RESET"),
    ),
  ).toEqual([]);
});
