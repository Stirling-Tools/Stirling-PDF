import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

/**
 * Verifies the new "Add attachment" and "Add bookmark" buttons on the
 * viewer's attachment + bookmark sidebars.
 *
 * After the UX refactor:
 *   - Attachment sidebar's Add button still navigates to the
 *     AddAttachments tool, BUT also closes the attachment sidebar so
 *     the user doesn't see two stacked side panels.
 *   - Bookmark sidebar's Add button opens an inline form (title + page,
 *     defaulting to the current page) inside the sidebar - the user
 *     never leaves the viewer. Submitting POSTs to the backend (not
 *     covered here - see the live spec for that).
 *
 * Backend-free spec.
 */

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

async function openViewerWithSample(page: import("@playwright/test").Page) {
  await page.goto("/read");
  await page.waitForLoadState("domcontentloaded");
  await page
    .locator('[data-testid="file-input"]')
    .first()
    .setInputFiles(SAMPLE_PDF);
  await expect(page.getByText(/\/\s*1/).first()).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("Viewer sidebar: Add attachment / Add bookmark buttons", () => {
  test("Attachment sidebar Add button navigates to tool and closes the sidebar", async ({
    page,
  }) => {
    await openViewerWithSample(page);

    const attachmentsToggle = page
      .getByRole("button", { name: /Toggle Attachments/i })
      .first();
    await attachmentsToggle.click();

    // Sidebar header shows up
    const sidebarTitle = page.getByText(/^Attachments$/i).first();
    await expect(sidebarTitle).toBeVisible({ timeout: 10_000 });

    const addBtn = page.getByRole("button", { name: /^Add attachment$/i });
    await expect(addBtn).toBeVisible({ timeout: 15_000 });

    await addBtn.click();

    // URL syncs to /add-attachments
    await expect(page).toHaveURL(/\/add-attachments$/, { timeout: 10_000 });
    // Sidebar should have auto-closed (no stacked panels)
    await expect(sidebarTitle).not.toBeVisible({ timeout: 5_000 });
  });

  test("Bookmark sidebar Add button opens an inline form (no navigation away from viewer)", async ({
    page,
  }) => {
    await openViewerWithSample(page);

    const initialUrl = page.url();

    await page
      .getByRole("button", { name: /Toggle Bookmarks/i })
      .first()
      .click();

    await expect(page.getByText(/^Bookmarks$/i).first()).toBeVisible({
      timeout: 10_000,
    });

    const addBtn = page.getByRole("button", { name: /^Add bookmark$/i });
    await expect(addBtn).toBeVisible({ timeout: 15_000 });

    await addBtn.click();

    // Inline form appears (title + page inputs + Save/Cancel) - the
    // form is identifiable by its data-testid so we don't depend on
    // matching label text fragility.
    const form = page.locator('[data-testid="bookmark-add-form"]');
    await expect(form).toBeVisible({ timeout: 10_000 });
    await expect(
      form.getByRole("textbox", { name: /Bookmark title/i }),
    ).toBeVisible();
    await expect(form.getByRole("button", { name: /^Save$/i })).toBeVisible();
    await expect(form.getByRole("button", { name: /^Cancel$/i })).toBeVisible();

    // Crucially, the URL did NOT change to the tool route - user stays
    // in the viewer.
    expect(page.url()).toBe(initialUrl);

    // Cancel closes the form (no backend hit)
    await form.getByRole("button", { name: /^Cancel$/i }).click();
    await expect(form).not.toBeVisible({ timeout: 5_000 });
  });

  test("Each sidebar header has a close (X) button that dismisses it", async ({
    page,
  }) => {
    await openViewerWithSample(page);

    // Visibility of the close button itself is the stable signal:
    // it's rendered only when the sidebar is mounted.
    //
    // Mantine 8 ActionIcon has a known pointer-event sequence quirk
    // where Playwright's synthesized click() can leave the button in
    // mantine-active without firing the React onClick handler. We
    // sidestep it by dispatching mousedown + mouseup + click explicitly,
    // which mirrors a real user's pointer interaction in browser.
    const closeViaButton = async (name: RegExp) => {
      const btn = page.getByRole("button", { name });
      await expect(btn).toBeVisible({ timeout: 10_000 });
      await btn.dispatchEvent("mousedown");
      await btn.dispatchEvent("mouseup");
      await btn.dispatchEvent("click");
      await expect(btn).not.toBeVisible({ timeout: 5_000 });
    };

    // Bookmark sidebar
    await page
      .getByRole("button", { name: /Toggle Bookmarks/i })
      .first()
      .click();
    await closeViaButton(/Close bookmarks sidebar/i);

    // Attachment sidebar
    await page
      .getByRole("button", { name: /Toggle Attachments/i })
      .first()
      .click();
    await closeViaButton(/Close attachments sidebar/i);

    // Thumbnail sidebar
    await page
      .getByRole("button", { name: /Toggle Sidebar/i })
      .first()
      .click();
    await closeViaButton(/Close thumbnails sidebar/i);
  });
});
