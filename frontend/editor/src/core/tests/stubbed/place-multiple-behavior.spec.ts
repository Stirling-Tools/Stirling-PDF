import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles, dismissTourTooltip } from "@app/tests/helpers/ui-helpers";
import type { Page } from "@playwright/test";
import path from "path";

const SAMPLE_PDF = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.pdf",
);
const SAMPLE_IMAGE = path.join(
  import.meta.dirname,
  "../test-fixtures/sample.png",
);

const FIRST_PAGE = '[data-page-index="0"]';
const IMAGE_INPUT = 'input[accept="image/*,.svg"]';
const pauseButton = (page: Page) =>
  page.getByRole("button", { name: /pause placement/i });
const resumeButton = (page: Page) =>
  page.getByRole("button", { name: /resume placement/i });
const placeMultipleBox = (page: Page) =>
  page.getByRole("checkbox", {
    name: /stay in placement mode after each placement/i,
  });
// Every placed stamp renders as one annotation container on the page layer.
const stamps = (page: Page) =>
  page.locator(FIRST_PAGE).first().locator('[data-no-interaction="true"]');

const placeAt = async (page: Page, x: number, y: number) => {
  await page.locator(FIRST_PAGE).first().click({ position: { x, y } });
  // Past the 60ms auto-activate window, so the toggle state has settled.
  await page.waitForTimeout(750);
};

/**
 * Reviewer report: on the stamp-style tools the "place multiple" checkbox
 * "doesn't do anything". Single placement never stuck because, after the
 * viewer auto-exited placement mode, SignSettings' auto-activate effect
 * immediately re-entered it. These tests drive real stamp placements and
 * assert both halves of the contract:
 *   - box off (default): placement exits after one stamp (Resume offered)
 *   - box on: placement stays armed AND further clicks really do place stamps
 *
 * Unit coverage of the decision lives in
 * components/tools/sign/placementMode.test.ts and
 * components/viewer/signaturePlacement.test.ts; this spec guards the
 * end-to-end UX so future refactors don't silently regress it.
 */
const TOOLS: Array<{
  name: string;
  url: string;
  arm: (page: Page) => Promise<void>;
}> = [
  {
    name: "AddText",
    url: "/add-text",
    arm: async (page) => {
      await page
        .getByPlaceholder("Enter the text you want to add")
        .fill("Reviewer Test");
    },
  },
  {
    name: "AddImage",
    url: "/add-image",
    arm: async (page) => {
      await page.locator(IMAGE_INPUT).setInputFiles(SAMPLE_IMAGE);
    },
  },
  {
    name: "Sign",
    url: "/sign",
    // Sign defaults to the draw canvas; the image source arms placement the
    // same way without needing pointer strokes.
    arm: async (page) => {
      await page.locator('label[for$="-image"]').click();
      await page.locator(IMAGE_INPUT).setInputFiles(SAMPLE_IMAGE);
    },
  },
];

for (const tool of TOOLS) {
  test.describe(`${tool.name} place-multiple behaviour`, () => {
    async function enterPlacementMode(page: Page): Promise<void> {
      await page.goto(tool.url);
      await page.waitForLoadState("domcontentloaded");
      await uploadFiles(page, SAMPLE_PDF);
      await dismissTourTooltip(page);

      // Wait for the PDF to render before configuring the signature. Placement
      // is activated once on change, so the viewer (and its SignatureAPIBridge)
      // must be mounted first or the activation is lost.
      await expect(page.locator(FIRST_PAGE).first()).toBeVisible({
        timeout: 30_000,
      });

      await tool.arm(page);

      // Placement active -> the toggle offers "Pause placement".
      await expect(pauseButton(page)).toBeVisible({ timeout: 20_000 });
    }

    test("single placement (default) exits placement mode", async ({
      page,
    }) => {
      await enterPlacementMode(page);

      await placeAt(page, 150, 150);

      await expect(resumeButton(page)).toBeVisible();
      await expect(pauseButton(page)).toBeHidden();
      await expect(stamps(page)).toHaveCount(1);
    });

    test("'place multiple' keeps placing stamps after the first", async ({
      page,
    }) => {
      await enterPlacementMode(page);
      await placeMultipleBox(page).check();

      await placeAt(page, 120, 120);
      await expect(stamps(page)).toHaveCount(1);

      await placeAt(page, 260, 260);
      await expect(stamps(page)).toHaveCount(2);

      // Still placing: Pause stays offered, Resume never appears.
      await expect(pauseButton(page)).toBeVisible();
      await expect(resumeButton(page)).toBeHidden();
    });

    test("pausing right after a placement drops no extra stamp", async ({
      page,
    }) => {
      await enterPlacementMode(page);
      await placeMultipleBox(page).check();

      // Deliberately not placeAt: Pause lands as early after the click as
      // Playwright allows, with none of the helper's settling.
      await page
        .locator(FIRST_PAGE)
        .first()
        .click({ position: { x: 150, y: 150 } });
      await pauseButton(page).click();
      await page.waitForTimeout(750);

      await expect(resumeButton(page)).toBeVisible();
      await expect(stamps(page)).toHaveCount(1);
    });
  });
}
