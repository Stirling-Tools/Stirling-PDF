import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import path from "path";

// Accessibility is fixed in the review, not the editor: the review card
// describes images, Properties sets the language, and both survive a save.

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/tagged-sample.pdf",
);

interface EditorWindow {
  __editor_store: {
    document: {
      documentLanguage: () => string | null;
      structure: (pageIndex: number) => {
        alt: (mcid: number) => string | null;
      };
    };
    state: {
      pages: {
        runs: { id: string; text: string }[];
        images: { id: string; mcid?: number }[];
      }[];
    };
  };
  __prev_document?: unknown;
}

const FIRST_IMAGE = () =>
  (window as unknown as EditorWindow).__editor_store.state.pages[0].images[0];

async function openFixture(page: Page) {
  await openInTextEditor(page, FIXTURE);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => page.evaluate(FIRST_IMAGE).then((image) => image?.id ?? null), {
      timeout: 30_000,
    })
    .not.toBeNull();
}

async function saveAndReopen(page: Page) {
  const downloaded = page.waitForEvent("download", { timeout: 30_000 });
  await page.getByTestId("pdf-editor-download").click();
  const confirm = page.getByTestId("pdf-editor-save-risk-confirm");
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  const saved = test.info().outputPath("accessibility-review.pdf");
  await (await downloaded).saveAs(saved);
  await page.evaluate(() => {
    const w = window as unknown as EditorWindow;
    w.__prev_document = w.__editor_store.document;
  });
  await openInTextEditor(page, saved);
  await page.waitForFunction(
    () => {
      const w = window as unknown as EditorWindow;
      const s = w.__editor_store;
      return !!s?.document && s.document !== w.__prev_document;
    },
    undefined,
    { timeout: 30_000 },
  );
}

test.describe("PDF accessibility review", () => {
  test("describes an image and sets the language, then the editor saves them", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFixture(page);

    // The editor itself offers no accessibility controls.
    await page.getByTestId("pdf-editor-tab-document").click();
    await expect(
      page.getByTestId("pdf-editor-document-language-picker"),
    ).toHaveCount(0);

    await page.getByTestId("viewer-review-accessibility").click();
    const card = page.getByTestId("pdf-editor-quick-tag");
    await expect(card).toBeVisible({ timeout: 15_000 });

    const image = await page.evaluate(FIRST_IMAGE);
    await page.getByTestId(`pdf-editor-image-${image.id}`).click();
    const description = card.getByTestId("pdf-editor-quick-tag-description");
    await expect(description).toHaveValue("Bar chart of revenue by region");
    await description.fill("Revenue by region, third quarter");
    await card.getByRole("button", { name: "Save description" }).click();

    await page.getByTestId("pdf-editor-properties").click();
    const picker = page
      .getByTestId("pdf-editor-document-language-picker")
      .getByRole("textbox");
    await picker.click();
    await picker.fill("en-IE");
    await page.getByRole("option", { name: /\(en-IE\)$/ }).click();
    await expect(picker).toHaveValue(/\(en-IE\)$/);

    // Leaving the review for the editor keeps the unsaved tags.
    await page.keyboard.press("Escape");
    await page.getByTestId("viewer-edit-text").click();
    await expect(card).toBeHidden();
    await saveAndReopen(page);

    const reopened = await page.evaluate((mcid) => {
      const doc = (window as unknown as EditorWindow).__editor_store.document;
      return {
        language: doc.documentLanguage(),
        alt: doc.structure(0).alt(mcid),
      };
    }, image.mcid!);
    expect(reopened).toEqual({
      language: "en-IE",
      alt: "Revenue by region, third quarter",
    });
  });
});
