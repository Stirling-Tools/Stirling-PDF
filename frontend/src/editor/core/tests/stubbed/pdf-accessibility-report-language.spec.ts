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
    language: "en",
    allFontsEmbedded: true,
    unembeddedFonts: 0,
    figures: 0,
    encrypted: false,
  },
};

interface EditorWindow {
  __editor_store?: {
    document: { documentLanguage: () => string | null } | null;
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

  const report = page.getByTestId("a11y-report");
  await report
    .getByRole("button", { name: "Language", exact: true, expanded: false })
    .click();
  const picker = page
    .getByTestId("a11y-report-language-picker")
    .getByRole("textbox");
  await expect(picker).toHaveValue(/\(en\)$/);

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
});
