import path from "path";
import type { Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { EditorStore } from "@editor/tools/pdfTextEditor/store/EditorStore";

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const RESTRICTED = path.join(FIXTURES, "owner-only-restricted.pdf");

type EditorWindow = Window & { __editor_store: EditorStore };

const openedName = (page: Page) =>
  page.evaluate(
    () => (window as unknown as EditorWindow).__editor_store.source.fileName,
  );

test.describe("PDF text editor - a file that does not open", () => {
  test("offers the permissions password for a restricted workbench file and takes its name once it opens", async ({
    page,
  }) => {
    await page.goto("/editor");
    await page.getByTestId("file-input").setInputFiles(RESTRICTED);
    // The upload opens the workbench's permission check, whose overlay takes
    // the click until it closes; on a slow WebKit that outlasts the default.
    await page
      .getByRole("link", { name: "PDF Text Editor", exact: true })
      .first()
      .click({ timeout: 60_000 });
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
    await expect.poll(() => openedName(page)).toBe("owner-only-restricted.pdf");
  });
});
