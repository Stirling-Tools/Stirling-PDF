import { test, expect } from "@editor/tests/helpers/stub-test-base";
import { openInTextEditor } from "@editor/tests/helpers/pdf-text-editor";
import type { Page } from "@playwright/test";
import { formulasPdf } from "@editor/tools/pdfTextEditor/__tests__/pdfFixtures";
import path from "path";

// Accessibility is fixed in the review, not the editor: the review card
// describes images, and the description survives a save.

const FIXTURE = path.join(
  import.meta.dirname,
  "../test-fixtures/tagged-sample.pdf",
);
const RESTRICTED = path.join(
  import.meta.dirname,
  "../test-fixtures/owner-only-restricted.pdf",
);

interface EditorWindow {
  __editor_store: {
    document: {
      structure: (pageIndex: number) => {
        alt: (mcid: number) => string | null;
        decorative: (mcid: number) => boolean;
        links: () => { annotation: number; holder: string | null }[];
        linkContents: (annotation: number) => string | null;
        setLinkContents: (annotation: number, contents: string | null) => void;
      };
    };
    state: {
      pages: {
        runs: { id: string; text: string }[];
        images: { id: string; mcid?: number; artifact?: boolean }[];
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
  test("describes an image, then the editor saves it", async ({ page }) => {
    test.setTimeout(120_000);
    await openFixture(page);

    // The editor itself offers no accessibility controls.
    await page.getByTestId("pdf-editor-tab-document").click();
    await expect(
      page.getByTestId("pdf-editor-document-accessibility"),
    ).toHaveCount(0);

    await page.getByTestId("viewer-review-accessibility").click();
    const card = page.getByTestId("pdf-editor-quick-tag");
    await expect(card).toBeVisible({ timeout: 15_000 });

    const image = await page.evaluate(FIRST_IMAGE);
    await page.getByTestId(`pdf-editor-image-${image.id}`).click();
    const description = card.getByTestId("pdf-editor-quick-tag-description");
    await expect(description).toHaveValue("Bar chart of revenue by region");
    await expect(description).toHaveAttribute(
      "placeholder",
      "Describe the image",
    );
    const savedAlt = () =>
      page.evaluate(
        (mcid) =>
          (window as unknown as EditorWindow).__editor_store.document
            .structure(0)
            .alt(mcid),
        image.mcid!,
      );
    await description.fill("Revenue by region");
    // Saved as typed, with nothing to press, and the field keeps focus.
    await expect.poll(savedAlt).toBe("Revenue by region");
    await expect(description).toBeFocused();
    // Moving straight on still saves what was typed, to this image.
    await description.fill("Revenue by region, third quarter");
    await page.locator('[data-testid^="pdf-editor-run-"]').first().click();
    await expect.poll(savedAlt).toBe("Revenue by region, third quarter");

    // Leaving the review for the editor keeps the unsaved tags.
    await page.keyboard.press("Escape");
    await page.getByTestId("viewer-edit-text").click();
    await expect(card).toBeHidden();
    await saveAndReopen(page);

    const alt = await page.evaluate(
      (mcid) =>
        (window as unknown as EditorWindow).__editor_store.document
          .structure(0)
          .alt(mcid),
      image.mcid!,
    );
    expect(alt).toBe("Revenue by region, third quarter");
  });

  test("shows a failed open's error while the editor runs hidden", async ({
    page,
  }) => {
    await page.getByTestId("file-input").setInputFiles(RESTRICTED);
    await page
      .getByRole("link", { name: "PDF Text Editor", exact: true })
      .first()
      .click({ timeout: 60_000 });
    await expect(page.getByTestId("pdf-editor-error")).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId("viewer-review-accessibility").click();
    await expect(page.getByTestId("pdf-editor-review-host")).toBeAttached();
    // The outgoing editor's own alert can linger a moment; this is the review's.
    const alert = page.locator(".review-error").getByTestId("pdf-editor-error");
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(
      alert.getByRole("button", { name: "Enter permissions password" }),
    ).toBeVisible();
  });

  test("gives a tagged link with no description its text", async ({ page }) => {
    await openFixture(page);
    await page.getByTestId("viewer-review-accessibility").click();
    await expect(page.getByTestId("pdf-editor-quick-tag")).toBeVisible({
      timeout: 15_000,
    });
    // The fixture's held link is described; clear it as a file without one would be.
    const annotation = await page.evaluate(() => {
      const structure = (
        window as unknown as EditorWindow
      ).__editor_store.document.structure(1);
      const held = structure.links().find((link) => link.holder !== null)!;
      structure.setLinkContents(held.annotation, null);
      return held.annotation;
    });

    await page.getByTestId("pdf-editor-page-1").scrollIntoViewIfNeeded();
    const appendixRun = () =>
      page.evaluate(
        () =>
          (
            window as unknown as EditorWindow
          ).__editor_store.state.pages[1]?.runs.find((run) =>
            run.text.includes("appendix"),
          )?.id ?? null,
      );
    await expect.poll(appendixRun).not.toBeNull();
    const runId = await appendixRun();
    await page.getByTestId(`pdf-editor-run-${runId}`).click();
    const describe = page.getByTestId("pdf-editor-quick-tag-describe-links");
    await describe.click();
    await expect(describe).toBeHidden();
    const described = await page.evaluate(
      (link) =>
        (window as unknown as EditorWindow).__editor_store.document
          .structure(1)
          .linkContents(link),
      annotation,
    );
    expect(described).toMatch(/appendix/i);
  });

  test("tags text as a formula from the card, then asks how it reads aloud", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openInTextEditor(page, {
      name: "formulas.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(formulasPdf()),
    });
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("viewer-review-accessibility").click();
    const card = page.getByRole("region", { name: "Accessibility review" });
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card).toBeFocused();

    const runId = await page.evaluate(
      () =>
        (
          window as unknown as EditorWindow
        ).__editor_store.state.pages[0].runs.find((run) =>
          run.text.includes("Where a is"),
        )!.id,
    );
    await page.getByTestId(`pdf-editor-run-${runId}`).click();
    const formula = card.getByRole("button", { name: /^Formula/ });
    await expect(formula).toHaveAttribute("aria-pressed", "false");
    await formula.click();
    await expect(formula).toHaveAttribute("aria-pressed", "true");
    await expect(card.getByText("Needs attention")).toBeVisible();
    const description = card.getByRole("textbox", {
      name: "How is this formula read aloud?",
    });
    await description.fill("a is the rate");
    await card.getByRole("button", { name: "Save description" }).click();

    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as EditorWindow).__editor_store.document
            .structure(0)
            .alt(3),
        ),
      )
      .toBe("a is the rate");
  });

  test("the save prompt covers the card, so tags can't change under it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openInTextEditor(page, {
      name: "formulas.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(formulasPdf()),
    });
    await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId("viewer-review-accessibility").click();
    const card = page.getByTestId("pdf-editor-quick-tag");
    await expect(card).toBeVisible({ timeout: 15_000 });
    const runId = await page.evaluate(
      () =>
        (
          window as unknown as EditorWindow
        ).__editor_store.state.pages[0].runs.find((run) =>
          run.text.includes("Where a is"),
        )!.id,
    );
    await page.getByTestId(`pdf-editor-run-${runId}`).click();
    await card.getByRole("button", { name: /^Quote/ }).click();

    await page.getByTestId("pdf-editor-review-close").click();
    await expect(
      page.getByRole("dialog", { name: "Save your tags?" }),
    ).toBeVisible();
    const chip = await card
      .getByRole("button", { name: /^Note/ })
      .boundingBox();
    const hitsCard = await page.evaluate(
      ({ x, y }) =>
        !!document
          .elementFromPoint(x, y)
          ?.closest('[data-testid="pdf-editor-quick-tag"]'),
      { x: chip!.x + chip!.width / 2, y: chip!.y + chip!.height / 2 },
    );
    expect(hitsCard).toBe(false);
  });

  test("marks an image decorative in the review, and the save keeps it", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openFixture(page);
    await page.getByTestId("viewer-review-accessibility").click();
    const card = page.getByTestId("pdf-editor-quick-tag");
    await expect(card).toBeVisible({ timeout: 15_000 });

    const image = await page.evaluate(FIRST_IMAGE);
    await page.getByTestId(`pdf-editor-image-${image.id}`).click();
    const decorative = () =>
      page.evaluate(() => {
        const store = (window as unknown as EditorWindow).__editor_store;
        const first = store.state.pages[0]?.images[0];
        if (!first) return null;
        return (
          !!first.artifact ||
          (first.mcid !== undefined &&
            store.document.structure(0).decorative(first.mcid))
        );
      });
    expect(await decorative()).toBe(false);
    const decorativeChip = card.getByTestId("pdf-editor-quick-tag-decorative");
    await expect(decorativeChip).toHaveAttribute("aria-pressed", "false");
    await decorativeChip.click();
    await expect.poll(decorative).toBe(true);

    await page.keyboard.press("Escape");
    await page.getByTestId("viewer-edit-text").click();
    await expect(card).toBeHidden();
    await saveAndReopen(page);

    await expect.poll(decorative, { timeout: 30_000 }).toBe(true);
  });
});
