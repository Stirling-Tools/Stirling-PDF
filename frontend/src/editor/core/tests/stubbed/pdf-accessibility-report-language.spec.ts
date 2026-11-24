import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { AccessibilityReport } from "@editor/types/checkAccessibility";

// The report's Language area sets the document language: the pick opens the file
// in the review, whose editor applies it as an undoable step.

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
      clause: "7.2",
      testNumber: "33",
      message: "Metadata has no language",
      severity: "error",
      occurrences: 2,
      autoFixable: false,
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
    document: { documentLanguage: () => string | null } | null;
    getState: () => { dirty: boolean; loading: boolean };
  };
}

test("sets the document language from the report's Language area", async ({
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

  // The tool opens the review as soon as the viewer shows the file. The hidden
  // editor's load (PDFium opening the file and reading its pages) can hold the
  // main thread long enough on a slow runner to stall a click on the report, so
  // the report is used only once that load has finished.
  await expect(page.getByTestId("pdf-editor-quick-tag")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const store = (window as unknown as EditorWindow).__editor_store;
          return !!store?.document && !store.getState().loading;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);

  const report = page.getByTestId("a11y-report");
  await report
    .getByRole("button", { name: "Language", exact: true, expanded: false })
    .click();
  const picker = page
    .getByTestId("a11y-report-language-picker")
    .getByRole("textbox");
  // The tool opens the review, whose editor shows the file's own language once
  // loaded; the stub matches it so either source reads the same.
  await expect(picker).toHaveValue(/\(en-US\)$/);
  // The picker leads the area, above the issues it fixes, with the area's own
  // heading as its only label.
  const body = report
    .locator(".a11y-area__body")
    .filter({ has: page.getByTestId("a11y-report-language-picker") });
  await expect(
    body
      .locator(":scope > :first-child")
      .getByTestId("a11y-report-language-picker"),
  ).toBeVisible();
  await expect(body.getByText("Language", { exact: true })).toHaveCount(0);

  await expect(async () => {
    await picker.click();
    await picker.fill("en-IE");
    await page.getByRole("option", { name: /\(en-IE\)$/ }).click();
    await expect(picker).toHaveValue(/\(en-IE\)$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  await expect(page.getByTestId("pdf-editor-quick-tag")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as EditorWindow
            ).__editor_store?.document?.documentLanguage() ?? null,
        ),
      { timeout: 30_000 },
    )
    .toBe("en-IE");
  await expect(picker).toHaveValue(/\(en-IE\)$/);
  // A document-wide setting saves at once, with no Save to press.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as EditorWindow).__editor_store?.getState()
              .dirty ?? true,
        ),
      { timeout: 30_000 },
    )
    .toBe(false);
});
