import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "path";

const FIXTURES_DIR = path.join(import.meta.dirname, "../test-fixtures");
const SAMPLES = [
  "compare_sample_a.pdf",
  "compare_sample_b.pdf",
  "sample.pdf",
  "rotated-pages.pdf",
  "annotations_out_of_order.pdf",
].map((name) => path.join(FIXTURES_DIR, name));

// Read from the running app, not imported: a spec resolves @app/* to a different layer than
// the browser build does, so an imported WORKBENCH_SESSION_RESTORE can disagree with reality.
async function restoreEnabled(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  await page.waitForFunction(
    () => document.documentElement.dataset.workbenchRestore !== undefined,
    null,
    { timeout: 20000 },
  );
  return page.evaluate(
    () => document.documentElement.dataset.workbenchRestore === "true",
  );
}

const NO_RESTORE = "this build ships the workbench restore off";
const NO_PROCESSOR = "this build ships no processor to switch to";

// Switching editor -> processor unmounts every editor provider; the session record
// in sessionStorage is what brings the workbench back on return.
test.describe("Workbench survives the editor/processor switch", () => {
  test.use({
    stubOptions: {
      enableLogin: true,
      user: {
        id: 44,
        username: "owner",
        email: "owner@example.com",
        role: "ROLE_USER",
        processorAccess: true,
      },
    },
    seedJwt: true,
  });

  test("open files and the library return after a round-trip", async ({
    page,
  }) => {
    test.skip(!(await restoreEnabled(page)), NO_RESTORE);

    // Processor endpoints the processor shell fetches on mount.
    for (const [pattern, json] of [
      ["**/api/v1/policies", []],
      ["**/api/v1/policies/runs", []],
      ["**/api/v1/policies/overview", { pipelines: [] }],
      ["**/api/v1/sources", { sources: [] }],
      ["**/api/v1/team/my", []],
    ] as const) {
      await page.route(pattern, (route) => route.fulfill({ json }));
    }

    await uploadFiles(page, SAMPLES);
    await expect(page.locator(".file-sidebar-file-item")).toHaveCount(
      SAMPLES.length,
      { timeout: 15000 },
    );

    // Uploading lands on the file grid, not the viewer - so the return has a
    // view it can get wrong (NavigationContext boots to "viewer").
    await expect(
      page.getByRole("radio", { name: /Active Files/i }),
    ).toBeChecked();

    // Out through the rail's processor mark, the only chrome that offers the switch.
    const processorMark = page.getByRole("button", { name: /^Processor$/i });
    test.skip(
      !(await processorMark.isVisible({ timeout: 5_000 }).catch(() => false)),
      NO_PROCESSOR,
    );
    await processorMark.click();
    await expect(page).toHaveURL(/\/processor/, { timeout: 15000 });

    // Split the two halves of the feature: if this fails the writer is at fault,
    // if it passes but the view below is wrong the seeding is.
    expect(
      await page.evaluate(() => ({
        session: JSON.parse(
          sessionStorage.getItem("stirling.workbench.session") ?? "{}",
        ),
        returnPath: sessionStorage.getItem(
          "stirling.workbench.editorReturnPath",
        ),
      })),
    ).toMatchObject({
      session: { workbench: "fileEditor" },
      returnPath: "/editor",
    });

    // Load the editor cold. Every provider mounts from nothing here, which is
    // the loss the restore has to cover on the way back.
    await page.goto("/editor", { waitUntil: "domcontentloaded" });

    await expect(page.locator(".file-sidebar-file-item")).toHaveCount(
      SAMPLES.length,
      { timeout: 20000 },
    );
    await expect(page.getByText(/compare_sample_a/i).first()).toBeVisible();
    await expect(
      page.getByRole("radio", { name: /Active Files/i }),
    ).toBeChecked({ timeout: 15000 });
    await expect(page.locator(".file-sidebar-loading")).toHaveCount(0, {
      timeout: 15000,
    });
  });
});

test.describe("The view survives a reload", () => {
  test.use({
    stubOptions: {
      enableLogin: true,
      user: {
        id: 44,
        username: "owner",
        email: "o@e.com",
        role: "ROLE_USER",
        processorAccess: true,
      },
    },
    seedJwt: true,
  });

  const currentView = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const r = Array.from(
        document.querySelectorAll<HTMLInputElement>("input[type=radio]"),
      ).find((x) => x.checked);
      return r?.value ?? "none";
    });

  test("comes back on the same view the user left", async ({ page }) => {
    test.skip(!(await restoreEnabled(page)), NO_RESTORE);

    await uploadFiles(page, SAMPLES.slice(0, 3));
    await expect(page.locator(".file-sidebar-file-item")).toHaveCount(3, {
      timeout: 15000,
    });

    // Open a document, so the view under test is the viewer rather than the grid.
    await page
      .getByRole("button", { name: /Open in Viewer/i })
      .first()
      .click({ force: true });
    await expect
      .poll(() => currentView(page), { timeout: 10000 })
      .toBe("viewer");

    // Whatever the workbench settled on is what a reload must reproduce.
    const before = await currentView(page);
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".file-sidebar-file-item")).toHaveCount(3, {
      timeout: 20000,
    });
    await page.waitForTimeout(3000);
    expect(await currentView(page)).toBe(before);
  });

  // The conjunction neither neighbour covers: the spec above proves the VIEW comes back,
  // engine-capabilities proves stored bytes decode, and nothing proved that the file the
  // restore reopened is one whose pixels actually arrive.
  test("a file the restore reopened renders its pages", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!(await restoreEnabled(page)), NO_RESTORE);

    await uploadFiles(page, SAMPLES.slice(0, 3));
    await expect(page.locator(".file-sidebar-file-item")).toHaveCount(3, {
      timeout: 15_000,
    });

    await page
      .getByRole("button", { name: /Open in Viewer/i })
      .first()
      .click({ force: true });
    await expect
      .poll(() => currentView(page), { timeout: 10_000 })
      .toBe("viewer");
    // Let the record settle: the writer debounces, so a reload can outrun it.
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".file-sidebar-file-item")).toHaveCount(3, {
      timeout: 30_000,
    });

    // A tile that decoded has non-zero naturalWidth. The restore resolves each recorded id
    // to its current leaf, so an empty tile here means it reopened something unreadable.
    const tile = page
      .locator('[data-page-index="0"]')
      .first()
      .locator('img[src^="blob:"]')
      .first();
    await expect(tile).toBeAttached({ timeout: 30_000 });
    await expect
      .poll(() => tile.evaluate((img: HTMLImageElement) => img.naturalWidth), {
        timeout: 30_000,
      })
      .toBeGreaterThan(0);
  });
});
