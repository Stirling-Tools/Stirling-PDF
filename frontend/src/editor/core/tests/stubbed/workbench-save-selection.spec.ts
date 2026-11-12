import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Locator, Page } from "@playwright/test";
import path from "path";
import { switchView, uploadFiles } from "@editor/tests/helpers/ui-helpers";

// Active Files has no selection UI, so its hidden selection must cover every
// open file: Save acts on the selection whenever there is one.

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const STORED = "sample.pdf";
const UPLOADED = "multi-page-sample.pdf";

function row(page: Page, name: string): Locator {
  return page.locator(".file-sidebar-file-item").filter({ hasText: name });
}

const IN_WORKBENCH = /(^|\s)selected(\s|$)/;

async function closeIntoLibrary(page: Page, name: string): Promise<void> {
  await uploadFiles(page, path.join(FIXTURES_DIR, name));
  await row(page, name).locator(".file-sidebar-file-name").click();
  await expect(row(page, name)).not.toHaveClass(IN_WORKBENCH);
}

const reopenFromSidebar: Record<string, (stored: Locator) => Promise<void>> = {
  "the row": (stored) => stored.locator(".file-sidebar-file-name").click(),
  "the eye button": async (stored) => {
    await stored.hover();
    await stored.locator(".file-sidebar-eye-btn").click();
  },
};

for (const [via, reopen] of Object.entries(reopenFromSidebar)) {
  test(`Save covers a stored file reopened from ${via} and an uploaded one`, async ({
    page,
  }) => {
    await closeIntoLibrary(page, STORED);

    await reopen(row(page, STORED));
    await expect(row(page, STORED)).toHaveClass(IN_WORKBENCH);
    await uploadFiles(page, path.join(FIXTURES_DIR, UPLOADED));
    await expect(row(page, UPLOADED)).toHaveClass(IN_WORKBENCH);

    await switchView(page, "Active Files");
    const downloaded: string[] = [];
    page.on("download", (download) =>
      downloaded.push(download.suggestedFilename()),
    );
    await page.getByRole("button", { name: /^Download (All|Files)$/ }).click();

    await expect
      .poll(() => [...downloaded].sort())
      .toEqual([UPLOADED, STORED].sort());
  });
}
