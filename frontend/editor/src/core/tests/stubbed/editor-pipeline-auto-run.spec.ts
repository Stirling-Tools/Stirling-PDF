import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

/**
 * PR #7581: a pipeline built on the Pipelines page can be set to run on the editor.
 * It has no catalogue category, so it must reach the auto-run by naming "editor" in
 * its sources - and a swept pipeline (blank sources) must NOT be mistaken for one.
 */

test.use({ autoGoto: false });

const SAMPLE = path.join(
  import.meta.dirname,
  "../test-fixtures/classification/unlabelled/invoice_acme.pdf",
);

/** A builder-made pipeline: no categoryId, one harmless step. */
function builderPipeline(options: Record<string, unknown>) {
  return {
    id: "builder-pipeline-1",
    name: "Flatten everything",
    owner: "system",
    enabled: true,
    trigger: null,
    sourceIds: [],
    steps: [{ operation: "/api/v1/misc/flatten", parameters: {} }],
    output: { type: "inline", options: { mode: "new_version", ...options } },
    teamId: 1,
  };
}

/** Install the policy list + capture every stored-policy run dispatch. */
async function armed(page: import("@playwright/test").Page, policy: unknown) {
  const dispatched: string[] = [];
  await page.route("**/api/v1/policies", (route) =>
    route.fulfill({ json: [policy] }),
  );
  await page.route("**/api/v1/policies/*/run", (route) => {
    dispatched.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { jobId: "job-1" } });
  });
  return dispatched;
}

test("an editor pipeline set to run on upload dispatches when a file is added", async ({
  page,
}) => {
  const dispatched = await armed(
    page,
    builderPipeline({ sources: ["editor"], runOn: "upload" }),
  );

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await uploadFiles(page, SAMPLE);

  await expect
    .poll(() => dispatched, { timeout: 15_000 })
    .toContain("/api/v1/policies/builder-pipeline-1/run");
});

test("a swept pipeline (blank sources) never runs on editor upload", async ({
  page,
}) => {
  const dispatched = await armed(
    page,
    builderPipeline({ sources: [], runOn: "upload" }),
  );

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await uploadFiles(page, SAMPLE);

  await page.waitForTimeout(5_000);
  expect(dispatched).toEqual([]);
});

test("an editor pipeline set to run on export does not fire on upload", async ({
  page,
}) => {
  const dispatched = await armed(
    page,
    builderPipeline({ sources: ["editor"], runOn: "export" }),
  );

  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await uploadFiles(page, SAMPLE);

  await page.waitForTimeout(5_000);
  expect(dispatched).toEqual([]);
});
