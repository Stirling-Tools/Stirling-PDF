import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLE = path.join(FIXTURES, "sample.pdf");
const ENCRYPTED = path.join(FIXTURES, "encrypted.pdf");
const RESTRICTED = path.join(FIXTURES, "owner-only-restricted.pdf");

type EditorWindow = Window & {
  __editor_store: EditorStore;
  __previousDocument?: unknown;
};

async function openSample(page: Page): Promise<void> {
  await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  await page.getByTestId("pdf-editor-file-input").setInputFiles(SAMPLE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("pdf-editor-filename")).toHaveText(
    "sample.pdf",
  );
  await page.evaluate(() => {
    const w = window as unknown as EditorWindow;
    w.__previousDocument = w.__editor_store.document;
  });
}

const sameDocument = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as EditorWindow;
    return w.__editor_store.document === w.__previousDocument;
  });

async function downloadName(page: Page): Promise<string> {
  const pending = page.waitForEvent("download");
  await page.getByTestId("pdf-editor-download").click();
  return (await pending).suggestedFilename();
}

test.describe("PDF text editor - a file that does not open", () => {
  test("keeps the open document's name when the new file is not a PDF", async ({
    page,
  }) => {
    await openSample(page);
    await page.getByTestId("pdf-editor-file-input").setInputFiles({
      name: "cannot-open.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("this is not a PDF"),
    });
    await expect(page.getByTestId("pdf-editor-error")).toBeVisible();
    expect(await sameDocument(page)).toBe(true);
    await expect(page.getByTestId("pdf-editor-filename")).toHaveText(
      "sample.pdf",
    );
    expect(await downloadName(page)).toBe("sample.pdf");
  });

  test("keeps the open document's name when its password prompt is cancelled, and takes the new name once unlocked", async ({
    page,
  }) => {
    await openSample(page);
    await page.getByTestId("pdf-editor-file-input").setInputFiles(ENCRYPTED);
    await expect(page.getByTestId("pdf-editor-password-input")).toBeVisible();
    await expect(page.getByTestId("pdf-editor-filename")).toHaveText(
      "sample.pdf",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("pdf-editor-password-input")).toBeHidden();
    expect(await sameDocument(page)).toBe(true);
    await expect(page.getByTestId("pdf-editor-filename")).toHaveText(
      "sample.pdf",
    );
    expect(await downloadName(page)).toBe("sample.pdf");

    await page.getByTestId("pdf-editor-file-input").setInputFiles(ENCRYPTED);
    await page.getByTestId("pdf-editor-password-input").fill("testpass123");
    await page.getByTestId("pdf-editor-password-submit").click();
    await expect(page.getByTestId("pdf-editor-filename")).toHaveText(
      "encrypted.pdf",
    );
    expect(await sameDocument(page)).toBe(false);
  });

  test("offers the permissions password for a restricted workbench file and takes its name once it opens", async ({
    page,
  }) => {
    await page.goto("/editor");
    await page.getByTestId("file-input").setInputFiles(RESTRICTED);
    await page
      .getByRole("link", { name: "PDF Text Editor", exact: true })
      .first()
      .click();
    const banner = page.getByTestId("pdf-editor-error");
    await banner
      .getByRole("button", { name: "Enter permissions password" })
      .click();
    await page
      .getByLabel("Permissions password", { exact: true })
      .fill("owner-test-password");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("pdf-editor-filename")).toHaveText(
      "owner-only-restricted.pdf",
    );
  });
});
