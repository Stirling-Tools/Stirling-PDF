// A signed form whose /AcroForm lives in a compressed object stream has no
// literal marker in its bytes, so the signature overlay must confirm the
// catalog before deciding the document has nothing to render.
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";
import path from "node:path";

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/signed-compressed-catalog.pdf",
);

test("a compressed-catalog signature still renders its overlay", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await uploadFiles(page, FIXTURE);
  await page.locator('[data-page-index="0"]').first().waitFor({
    timeout: 60_000,
  });
  await expect(page.locator('[data-signature-overlay-page="0"]')).toBeVisible({
    timeout: 30_000,
  });
});
