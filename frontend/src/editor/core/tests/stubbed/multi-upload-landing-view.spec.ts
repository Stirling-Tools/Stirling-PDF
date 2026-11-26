import fs from "fs";
import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

/** Which view an upload from the empty landing page settles on. */

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLES = [
  path.join(FIXTURES, "sample.pdf"),
  path.join(FIXTURES, "compare_sample_a.pdf"),
  path.join(FIXTURES, "compare_sample_b.pdf"),
];

// Enough that the upload lasts long enough to show whatever view it passes through.
const MANY = fs
  .readdirSync(FIXTURES)
  .filter(
    (f) =>
      f.endsWith(".pdf") &&
      !/encrypt|corrupt|damaged|owner-only|big-sample|many-pages/.test(f),
  )
  .slice(0, 24)
  .map((f) => path.join(FIXTURES, f));

const landingInput = (page: import("@playwright/test").Page) =>
  page.locator('.landing-actions-enter input[type="file"]');

/** Records whether `selector` matches at any moment from now on, however briefly. */
async function watchFor(
  page: import("@playwright/test").Page,
  selector: string,
) {
  const key = `seen ${selector}`;
  await page.evaluate(
    ([k, sel]) => {
      const seen = window as unknown as Record<string, boolean>;
      seen[k] = !!document.querySelector(sel);
      new MutationObserver(() => {
        if (document.querySelector(sel)) seen[k] = true;
      }).observe(document.body, { subtree: true, childList: true });
    },
    [key, selector] as const,
  );
  return () =>
    page.evaluate(
      (k) => (window as unknown as Record<string, boolean>)[k],
      key,
    );
}

/** The password prompts follow one another, so each is told apart by its file name. */
async function nextPrompt(
  page: import("@playwright/test").Page,
  names: readonly string[],
) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const text = (await dialog.textContent()) ?? "";
  return dialog.filter({ hasText: names.find((f) => text.includes(f)) });
}

test("several files from the landing page open in Active Files", async ({
  page,
}) => {
  // The view switcher already reads "viewer" on the empty landing page, so a
  // detour through the viewer is caught by it drawing a page instead.
  const viewerOpened = await watchFor(page, "[data-page-index]");

  await landingInput(page).setInputFiles(MANY);
  await expect(page.locator("[data-file-id]")).toHaveCount(MANY.length, {
    timeout: 60_000,
  });

  await expect(
    page.getByRole("radio", { name: /Active Files/i }),
  ).toBeChecked();
  expect(await viewerOpened()).toBe(false);
});

test("switching to the viewer during an upload survives its end", async ({
  page,
}) => {
  await landingInput(page).setInputFiles(MANY);
  // Still uploading when the user switches.
  const progress = page.locator(".file-sidebar-bulk-add");
  await expect(progress).toBeVisible({ timeout: 30_000 });
  const viewer = page.getByRole("radio", { name: /Viewer/i });
  await viewer.evaluate((el: HTMLInputElement) => el.click());
  await expect(viewer).toBeChecked();
  await expect(progress).toHaveCount(0, { timeout: 60_000 });
  // Nothing marks the moment the upload's end has been handled, and a frame
  // or two is not always enough to see the switch back, so allow a second.
  await page.waitForTimeout(1000);
  await expect(viewer).toBeChecked();
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
    const locked = files.filter((f) => f.startsWith("encrypted"));
    await landingInput(page).setInputFiles(
      files.map((f) => path.join(FIXTURES, f)),
    );
    for (let i = 0; i < locked.length; i++) {
      const prompt = await nextPrompt(page, locked);
      const password = prompt.locator('input[type="password"]');
      // Shown once the file's permissions have been checked.
      await expect(password).toBeVisible({ timeout: 30_000 });
      await password.fill("annotation-test");
      await password.press("Enter");
      await expect(prompt).toBeHidden({ timeout: 30_000 });
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

test("a PDF that only restricts actions opens without a password prompt", async ({
  page,
}) => {
  const asPdf = (fixture: string, name: string) => ({
    name,
    mimeType: "application/pdf",
    buffer: fs.readFileSync(path.join(FIXTURES, fixture)),
  });
  // The first check also starts the PDF engine, which on a slow machine can
  // outlast the prompt's delay; what matters is every check after it.
  await landingInput(page).setInputFiles(
    asPdf("owner-only-restricted.pdf", "warm-up.pdf"),
  );
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1, {
    timeout: 30_000,
  });
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });

  const prompted = await watchFor(page, '[role="dialog"]');
  await page
    .getByTestId("file-input")
    .setInputFiles([
      asPdf("owner-only-restricted.pdf", "restricted.pdf"),
      asPdf("sample.pdf", "sample.pdf"),
    ]);
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(3, {
    timeout: 15_000,
  });
  expect(await prompted()).toBe(false);
});

test("skipping every password leaves a later single file to open in the viewer", async ({
  page,
}) => {
  // Put sample.pdf in Recents, then take it off the workbench again.
  await landingInput(page).setInputFiles(SAMPLES[0]);
  const sample = page.locator(".file-sidebar-file-item", {
    hasText: "sample.pdf",
  });
  await expect(sample).toBeVisible({ timeout: 15_000 });
  await sample.click();
  await expect(landingInput(page)).toBeAttached({ timeout: 15_000 });

  const locked = ["encrypted-annotations.pdf", "encrypted-links.pdf"];
  await landingInput(page).setInputFiles(
    locked.map((f) => path.join(FIXTURES, f)),
  );
  for (let i = 0; i < locked.length; i++) {
    const prompt = await nextPrompt(page, locked);
    // The prompt resizes once its check is done; a click during that misses.
    await expect(prompt.locator('input[type="password"]')).toBeVisible({
      timeout: 30_000,
    });
    await prompt.getByRole("button", { name: "Close" }).click();
    await expect(prompt).toBeHidden({ timeout: 15_000 });
  }
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });

  await sample.click();
  await expect(page.getByRole("radio", { name: /Viewer/i })).toBeChecked({
    timeout: 15_000,
  });
  await expect(page.locator("[data-page-index]").first()).toBeVisible({
    timeout: 30_000,
  });
});

test("one file from the landing page opens in the viewer", async ({ page }) => {
  await landingInput(page).setInputFiles(SAMPLES[0]);
  // The empty landing page already reads "viewer", so wait for the page itself.
  await expect(page.locator("[data-page-index]").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("radio", { name: /Viewer/i })).toBeChecked({
    timeout: 15_000,
  });
});
