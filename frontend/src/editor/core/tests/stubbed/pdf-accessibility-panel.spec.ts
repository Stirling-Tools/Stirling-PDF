import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";

// The tool panel reads top to bottom: the score, the breakdown, the open review's
// live view of the document, the manual checks, then the actions.

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
      clause: "7.1",
      testNumber: "3",
      message: "Content is not tagged",
      severity: "error",
      occurrences: 1,
      autoFixable: false,
    },
  ],
  humanChecks: ["Is the reading order correct?"],
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

test("lays the panel out in reading order, and pauses the review from its footer", async ({
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

  const results = page.getByTestId("a11y-results");
  const summary = results.getByTestId("pdf-editor-review-summary");
  await expect(summary).toBeVisible({ timeout: 30_000 });
  const order = await results.evaluate((root) =>
    [
      ".a11y-hero",
      ".a11y-breakdown",
      '[data-testid="pdf-editor-review-summary"]',
      '[data-testid="a11y-manual-checks"]',
    ].map((selector) => {
      const el = root.querySelector(selector);
      return el ? el.getBoundingClientRect().top : null;
    }),
  );
  expect(order.every((top) => top !== null)).toBe(true);
  expect([...order].sort((a, b) => a! - b!)).toEqual(order);

  await expect(page.getByTestId("a11y-tag-everything")).toBeVisible();
  await expect(page.getByTestId("a11y-download-report")).toBeVisible();
  await page.getByTestId("a11y-pause-fixing").click();
  await expect(page.getByTestId("pdf-editor-quick-tag")).toBeHidden();
  await expect(summary).toBeHidden();
  await expect(page.getByTestId("a11y-fix-in-document")).toBeVisible();
});
