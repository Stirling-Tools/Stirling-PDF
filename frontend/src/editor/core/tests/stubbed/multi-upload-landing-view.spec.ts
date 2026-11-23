import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

/** Which view an upload from the empty landing page settles on. */

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLES = [
  path.join(FIXTURES, "sample.pdf"),
  path.join(FIXTURES, "compare_sample_a.pdf"),
  path.join(FIXTURES, "compare_sample_b.pdf"),
];

const landingInput = (page: import("@playwright/test").Page) =>
  page.locator('.landing-actions-enter input[type="file"]');

test("several files from the landing page open in Active Files", async ({
  page,
}) => {
  // The view switcher already reads "viewer" on the empty landing page, so a
  // detour through the viewer is caught by it drawing a page instead.
  await page.evaluate(() => {
    const flag = window as unknown as { viewerOpened: boolean };
    flag.viewerOpened = false;
    new MutationObserver(() => {
      if (document.querySelector("[data-page-index]")) flag.viewerOpened = true;
    }).observe(document.body, { subtree: true, childList: true });
  });

  await landingInput(page).setInputFiles(SAMPLES);
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(
    SAMPLES.length,
    { timeout: 15_000 },
  );

  await expect(
    page.getByRole("radio", { name: /Active Files/i }),
  ).toBeChecked();
  const viewerOpened = await page.evaluate(
    () => (window as unknown as { viewerOpened: boolean }).viewerOpened,
  );
  expect(viewerOpened).toBe(false);
});

// Locked PDFs join the workbench only once unlocked, after the upload itself
// has finished, so these arrive one at a time however many were picked.
for (const [label, files] of [
  ["one of them needs", ["encrypted-annotations.pdf", "sample.pdf"]],
  ["all of them need", ["encrypted-annotations.pdf", "encrypted-links.pdf"]],
] as const) {
  test(`several files open in Active Files when ${label} a password`, async ({
    page,
  }) => {
    const locked = files.filter((f) => f.startsWith("encrypted")).length;
    await landingInput(page).setInputFiles(
      files.map((f) => path.join(FIXTURES, f)),
    );
    for (let i = 0; i < locked; i++) {
      const password = page
        .getByRole("dialog")
        .locator('input[type="password"]');
      await expect(password).toBeVisible({ timeout: 30_000 });
      await password.fill("annotation-test");
      await password.press("Enter");
      await expect(password).toBeHidden({ timeout: 30_000 });
    }

    await expect(page.locator(".file-sidebar-file-item")).toHaveCount(
      files.length,
      { timeout: 15_000 },
    );
    await expect(
      page.getByRole("radio", { name: /Active Files/i }),
    ).toBeChecked();
  });
}

test("one file from the landing page opens in the viewer", async ({ page }) => {
  await landingInput(page).setInputFiles(SAMPLES[0]);
  await expect(page.getByRole("radio", { name: /Viewer/i })).toBeChecked({
    timeout: 15_000,
  });
});
