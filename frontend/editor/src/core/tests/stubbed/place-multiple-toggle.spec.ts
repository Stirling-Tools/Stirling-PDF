import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "path";

const SAMPLE_PDF = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");

const TOOLS_WITH_PLACEMENT_TOGGLE: Array<{ name: string; url: string }> = [
  { name: "AddImage", url: "/add-image" },
  { name: "AddText", url: "/add-text" },
  { name: "Sign", url: "/sign" },
];

/**
 * The "place multiple" checkbox is rendered by SignSettings for the three
 * stamp-style tools (AddImage / AddText / Sign). Behaviour contract:
 *   - Default unchecked: placement mode auto-exits after one stamp
 *   - Toggling on keeps the user in placement mode across multiple stamps
 * Helper logic is unit-tested in signaturePlacement.test.ts; this spec
 * verifies the UI contract end-to-end so future SignSettings refactors do
 * not silently regress the default UX.
 */
for (const tool of TOOLS_WITH_PLACEMENT_TOGGLE) {
  test.describe(`${tool.name} placement toggle`, () => {
    test("renders the 'place multiple' checkbox unchecked by default", async ({
      page,
    }) => {
      await page.goto(tool.url);
      await page.waitForLoadState("domcontentloaded");
      await uploadFiles(page, SAMPLE_PDF);

      const placeMultiple = page.getByRole("checkbox", {
        name: /stay in placement mode after each placement/i,
      });
      await expect(placeMultiple).toBeVisible({ timeout: 15_000 });
      await expect(placeMultiple).not.toBeChecked();
    });

    test("toggling the 'place multiple' checkbox flips its state", async ({
      page,
    }) => {
      await page.goto(tool.url);
      await page.waitForLoadState("domcontentloaded");
      await uploadFiles(page, SAMPLE_PDF);

      const placeMultiple = page.getByRole("checkbox", {
        name: /stay in placement mode after each placement/i,
      });
      await expect(placeMultiple).toBeVisible({ timeout: 15_000 });
      await placeMultiple.check();
      await expect(placeMultiple).toBeChecked();
      await placeMultiple.uncheck();
      await expect(placeMultiple).not.toBeChecked();
    });
  });
}
