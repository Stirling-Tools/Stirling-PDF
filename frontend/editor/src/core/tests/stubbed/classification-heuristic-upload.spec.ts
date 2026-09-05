import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";
import { uploadFiles } from "@app/tests/helpers/ui-helpers";

// A bulk upload must classify every file in the browser and group it - no file
// may be stranded in "Other" by races between the upload wave and delivery.

test.use({ autoGoto: false });

const FIXTURES = path.join(
  import.meta.dirname,
  "../test-fixtures/classification/unlabelled",
);

/**
 * What GET /api/v1/policies returns for the row an older
 * DefaultClassificationPolicySeeder wrote - i.e. one stored before editor
 * participation had its own field. `JpaPolicyStore.liftEditorConfig` derives the
 * `editor` block from the legacy `output.options` on read; the lift is additive,
 * so a real response carries both. Migration of the stored shape itself is
 * covered by JpaPolicyStoreTest, which exercises the Java the stub stands in for.
 */
const SEEDED_POLICY = {
  id: "seeded-classification",
  name: "Classification Policy",
  owner: "system",
  enabled: true,
  inputs: [],
  steps: [{ operation: "/api/v1/ai/tools/classify-and-label", parameters: {} }],
  output: {
    type: "inline",
    options: {
      categoryId: "classification",
      runOn: "upload",
      mode: "new_version",
      sources: ["editor"],
      scopeTypes: [],
      reviewerEmail: "",
    },
  },
  outputIds: [],
  teamId: 1,
  editor: { allowed: true, runOn: "upload" },
};

test("a 10-file upload wave classifies every file into its group", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.route("**/api/v1/policies", (route) =>
    route.fulfill({ json: [SEEDED_POLICY] }),
  );
  await page.route("**/api/v1/policies/classify/meter", (route) =>
    route.fulfill({ status: 202, body: "" }),
  );
  await page.goto("/editor", {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });

  await uploadFiles(
    page,
    [
      "invoice_acme.pdf",
      "bank_statement.pdf",
      "purchase_order.pdf",
      "nda_mutual.pdf",
      "service_agreement.pdf",
      "resume_jane_doe.pdf",
      "cover_letter.pdf",
      "offer_letter.pdf",
      "generic_notes.pdf",
      "spanish_contrato.pdf",
    ].map((f) => path.join(FIXTURES, f)),
  );

  // Each group header is a collapsible button whose name carries the member count.
  // Classification runs a few files per idle pass; wait for the full drain.
  const header = (name: string, count: number) =>
    page.getByRole("button", { name: `${name} ${count}`, exact: true });
  await expect(header("Financial", 3)).toBeVisible({ timeout: 90_000 });
  await expect(header("HR", 3)).toBeVisible({ timeout: 30_000 });
  await expect(header("Legal", 2)).toBeVisible({ timeout: 30_000 });

  // The regression: nothing classifiable may be stranded in Other - only the
  // genuinely unlabellable pair (generic prose + non-English) belongs there.
  await expect(header("Other", 2)).toBeVisible({ timeout: 30_000 });
  // The filename can render in several places (Recent, group, viewer); any hit proves presence.
  await expect(page.getByText("generic_notes.pdf").first()).toBeVisible();
  await expect(page.getByText("spanish_contrato.pdf").first()).toBeVisible();
});
