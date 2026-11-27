import path from "path";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";

// While the review has the checked file open, declaring PDF/UA from the report
// is one of the review's unsaved edits, written by its Save.

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/tagged-sample.pdf",
);

const REPORT: AccessibilityReport = {
  profile: "PDF/UA-1",
  tagged: true,
  declaresConformance: false,
  passesAutomatedChecks: false,
  issues: [
    {
      clause: "5",
      testNumber: "1",
      specification: "PDF/UA-1",
      message: "The document does not declare PDF/UA",
      severity: "error",
      occurrences: 1,
      autoFixable: false,
      tags: ["metadata"],
    },
  ],
  humanChecks: [],
  automaticallyFixable: 0,
  needsInput: 1,
  figuresNeedingDescription: [],
  summary: {
    pages: 2,
    hasTitle: true,
    displaysDocTitle: true,
    hasLanguage: true,
    language: "en-US",
    allFontsEmbedded: true,
    unembeddedFonts: 0,
    figures: 0,
    encrypted: false,
  },
};

interface EditorWindow {
  __editor_store?: {
    document: { conformanceClaim: () => number | null } | null;
    getState: () => { dirty: boolean; loading: boolean };
  };
}

function editorClaim(page: Page) {
  return page.evaluate(() => {
    const store = (window as unknown as EditorWindow).__editor_store;
    return store?.document
      ? {
          part: store.document.conformanceClaim(),
          dirty: store.getState().dirty,
        }
      : null;
  });
}

async function expandFully(toggle: Locator) {
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const bodyId = await toggle.getAttribute("aria-controls");
  const body = toggle.page().locator(`[id="${bodyId}"]`);
  await expect
    .poll(() => body.evaluate((element) => element.getAnimations().length))
    .toBe(0);
}

test("declares PDF/UA from the report as an unsaved edit in the review", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route("**/api/v1/security/accessibility-report", (route) =>
    route.fulfill({ json: REPORT }),
  );
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page
    .getByText("PDF accessibility", { exact: true })
    .first()
    .click({ timeout: 60_000 });

  // The report hands the claim to the review only once the review's load has
  // finished; before that it would write the file itself.
  await expect(page.getByTestId("pdf-editor-quick-tag")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => editorClaim(page), { timeout: 30_000 })
    .toEqual({ part: null, dirty: false });

  const report = page.getByTestId("a11y-report");
  await expandFully(
    report.getByRole("button", {
      name: "Metadata & settings",
      exact: true,
    }),
  );
  const checkbox = page.getByTestId("a11y-conformance-claim");
  await expect(checkbox).not.toBeChecked();

  await expandFully(
    report.getByRole("button", {
      name: "Doesn't declare PDF/UA",
      exact: true,
    }),
  );
  await page.getByTestId("a11y-declare-conformance").click();

  await expect
    .poll(() => editorClaim(page), { timeout: 10_000 })
    .toEqual({ part: 1, dirty: true });
  await expect(page.getByTestId("a11y-declare-conformance")).toBeDisabled();
  await expect(checkbox).toBeChecked();

  await report.locator("label", { has: checkbox }).click();
  await expect
    .poll(() => editorClaim(page), { timeout: 10_000 })
    .toMatchObject({ part: null });
  await expect(checkbox).not.toBeChecked();
  await expect(page.getByTestId("a11y-declare-conformance")).toBeEnabled();
});
