import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles, dismissTourTooltip } from "@app/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";
import path from "path";

const SAMPLE_PDF = path.join(__dirname, "../test-fixtures/sample.pdf");

const FIRST_PAGE = '[data-page-index="0"]';
const pauseButton = (page: Page) =>
  page.getByRole("button", { name: /pause placement/i });
const resumeButton = (page: Page) =>
  page.getByRole("button", { name: /resume placement/i });

/**
 * Reviewer report: on the stamp-style tools the "place multiple" checkbox
 * "doesn't do anything". Single placement never stuck because, after the
 * viewer auto-exited placement mode, SignSettings' auto-activate effect
 * immediately re-entered it. These tests drive a real text-stamp placement and
 * assert the placement toggle settles into the correct state:
 *   - box off (default): placement exits after one stamp (Resume offered)
 *   - box on: placement stays active across stamps (Pause stays offered)
 *
 * Unit coverage of the decision lives in
 * components/tools/sign/placementMode.test.ts; this spec guards the end-to-end
 * UX so future refactors don't silently regress it.
 */
test.describe("AddText place-multiple behaviour", () => {
  async function enterPlacementMode(page: Page): Promise<void> {
    await page.goto("/add-text");
    await page.waitForLoadState("domcontentloaded");
    await uploadFiles(page, SAMPLE_PDF);
    await dismissTourTooltip(page);

    // Wait for the PDF to render before configuring the signature. Placement is
    // activated on text change and only fires once, so the viewer (and its
    // SignatureAPIBridge) must be mounted first or the activation is lost.
    await expect(page.locator(FIRST_PAGE).first()).toBeVisible({
      timeout: 30_000,
    });

    // Configuring a text signature auto-activates placement mode.
    await page
      .getByPlaceholder("Enter the text you want to add")
      .fill("Reviewer Test");

    // Placement active -> the toggle offers "Pause placement".
    await expect(pauseButton(page)).toBeVisible({ timeout: 20_000 });
  }

  test("single placement (default) exits placement mode", async ({ page }) => {
    await enterPlacementMode(page);

    await page.locator(FIRST_PAGE).first().click({ position: { x: 150, y: 150 } });

    // Wait past the 60ms auto-activate window: with the fix the tool stays
    // exited; without it placement bounces straight back into "Pause" mode.
    await page.waitForTimeout(750);

    await expect(resumeButton(page)).toBeVisible();
    await expect(pauseButton(page)).toBeHidden();
  });

  test("'place multiple' keeps placement active after a placement", async ({
    page,
  }) => {
    await enterPlacementMode(page);

    await page
      .getByRole("checkbox", {
        name: /stay in placement mode after each placement/i,
      })
      .check();

    await page.locator(FIRST_PAGE).first().click({ position: { x: 150, y: 150 } });
    await page.waitForTimeout(750);

    // Still placing: Pause stays offered, Resume never appears.
    await expect(pauseButton(page)).toBeVisible();
    await expect(resumeButton(page)).toBeHidden();
  });
});
