import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

// The sidebar groups files by the category in their `StirlingPDFClassification`
// metadata; these specs exercise that seam with pre-labelled fixtures.

const FIXTURES = path.join(
  import.meta.dirname,
  "../test-fixtures/classification",
);

const categoryHeaders = (page: import("@playwright/test").Page) =>
  page.locator(".file-sidebar-group .file-sidebar-group-header");

test("classified files group by category family in the sidebar", async ({
  page,
}) => {
  await uploadFiles(page, [
    path.join(FIXTURES, "classified_invoice.pdf"), // -> Financial
    path.join(FIXTURES, "classified_nda.pdf"), // -> Legal
    path.join(FIXTURES, "classified_resume.pdf"), // -> HR
  ]);

  // The backfill reads each file's classification metadata on idle and regroups;
  // the category headers appear once it resolves (Playwright auto-retries).
  const headers = categoryHeaders(page);
  await expect(headers.filter({ hasText: "Financial" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(headers.filter({ hasText: "Legal" })).toBeVisible();
  await expect(headers.filter({ hasText: "HR" })).toBeVisible();
});

test("an unclassified file is not placed in a category group", async ({
  page,
}) => {
  // sample.pdf carries no StirlingPDFClassification metadata, so it must not
  // create or join any category family group - it falls into the catch-all.
  await uploadFiles(page, path.join(FIXTURES, "../sample.pdf"));

  // Give the idle backfill a chance to run and (find nothing to) regroup.
  await expect(page.locator(".file-sidebar-file-item")).toHaveCount(1);
  await expect(
    categoryHeaders(page).filter({ hasText: "Financial" }),
  ).toHaveCount(0);
});
