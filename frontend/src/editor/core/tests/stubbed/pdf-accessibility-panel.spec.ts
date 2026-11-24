import { readFile } from "node:fs/promises";
import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";

// The tool panel reads top to bottom: the score, the breakdown, the manual
// checks, the open review's live view of the document, then the actions.

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

test("flags the document as tagged from the report's fix, saving it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  let checks = 0;
  await page.route("**/api/v1/security/accessibility-report", (route) => {
    checks += 1;
    return route.fulfill({
      json: {
        ...REPORT,
        issues: [
          {
            specification: "PDF/UA-1",
            clause: "6.2",
            testNumber: "1",
            message: "MarkInfo /Marked is not true",
            severity: "error",
            occurrences: 1,
            autoFixable: false,
          },
        ],
      } satisfies AccessibilityReport,
    });
  });
  // Renaming the key, at the same length so the xref offsets hold, leaves the
  // file tagged but not flagged as tagged.
  const unflagged = Buffer.from(
    (await readFile(FIXTURE))
      .toString("latin1")
      .replace("/Marked true", "/Xarked true"),
    "latin1",
  );
  await page.getByTestId("file-input").setInputFiles({
    name: "unflagged.pdf",
    mimeType: "application/pdf",
    buffer: unflagged,
  });
  await page
    .getByText("PDF accessibility", { exact: true })
    .first()
    .click({ timeout: 60_000 });
  await expect(page.getByTestId("pdf-editor-quick-tag")).toBeVisible({
    timeout: 30_000,
  });

  const store = () =>
    page.evaluate(() => {
      const editor = (
        window as unknown as {
          __editor_store?: {
            document: { markedTagged: () => boolean } | null;
            getState: () => { dirty: boolean; loading: boolean };
          };
        }
      ).__editor_store;
      return {
        marked: editor?.document?.markedTagged() ?? null,
        dirty: editor?.getState().dirty ?? null,
      };
    });
  await expect.poll(async () => (await store()).marked).toBe(false);
  const report = page.getByTestId("a11y-report");
  await report
    .getByRole("button", {
      name: "Tags & structure",
      exact: true,
      expanded: false,
    })
    .click();
  await report
    .getByRole("button", {
      name: "Not flagged as tagged",
      exact: true,
      expanded: false,
    })
    .click();
  await page
    .locator('[data-testid="a11y-fix-issue"][data-fix="markedTagged"]')
    .click();

  await expect
    .poll(store, { timeout: 30_000 })
    .toEqual({ marked: true, dirty: false });
  // No checkbox to hunt for: the review carries the flag itself.
  await expect(
    page.getByTestId("pdf-editor-review-summary").getByRole("checkbox"),
  ).toHaveCount(0);
  await expect(page.getByTestId("check-accessibility-recheck")).toBeVisible();
  expect(checks).toBe(1);
});

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
      '[data-testid="a11y-manual-checks"]',
      '[data-testid="pdf-editor-review-summary"]',
    ].map((selector) => {
      const el = root.querySelector(selector);
      return el ? el.getBoundingClientRect().top : null;
    }),
  );
  expect(order.every((top) => top !== null)).toBe(true);
  expect([...order].sort((a, b) => a! - b!)).toEqual(order);

  await expect(summary.getByTestId("pdf-editor-heading-problems")).toHaveText(
    "1 to fix",
  );
  // A heading in the outline jumps to its text on the page.
  await summary.getByRole("button", { name: /Appendix: method/ }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const store = (
          window as unknown as {
            __editor_store: { selection: { value: { runIds: string[] } } };
          }
        ).__editor_store;
        const [id] = store.selection.value.runIds;
        return id
          ? (document.querySelector(`[data-testid="pdf-editor-run-${id}"]`)
              ?.textContent ?? null)
          : null;
      }),
    )
    .toContain("Appendix: method");
  await expect(
    page
      .locator('[data-testid^="pdf-editor-run-"]')
      .filter({ hasText: "Appendix: method" }),
  ).toBeInViewport();
  // The manual checks wait collapsed, their state beside the title.
  const manual = results.getByTestId("a11y-manual-checks");
  await expect(manual.getByTestId("a11y-manual-status")).toHaveText(
    "In progress",
  );
  const manualHeader = manual.getByRole("button", {
    name: "Manual checks",
    exact: true,
  });
  await expect(manualHeader).toHaveAttribute("aria-expanded", "false");
  await manualHeader.click();
  await expect(manualHeader).toHaveAttribute("aria-expanded", "true");
  await expect(manual.getByText("Is the reading order correct?")).toBeVisible();

  await expect(page.getByTestId("a11y-tag-everything")).toBeVisible();
  await expect(page.getByTestId("a11y-download-report")).toBeVisible();
  await page.getByTestId("a11y-pause-fixing").click();
  await expect(page.getByTestId("pdf-editor-quick-tag")).toBeHidden();
  await expect(summary).toBeHidden();
  await expect(page.getByTestId("a11y-fix-in-document")).toBeVisible();
});
