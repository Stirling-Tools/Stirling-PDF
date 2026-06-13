import { test, expect } from "@app/tests/helpers/stub-test-base";
import path from "path";

const ANNOTATED_PDF = path.join(
  __dirname,
  "../test-fixtures/annotations_out_of_order.pdf",
);

/**
 * Regression test for https://github.com/Stirling-Tools/Stirling-PDF/issues/6439
 *
 * The fixture PDF (3 pages) has 4 text annotations per page stored in
 * deliberately scrambled object order (D, B, C, A). With the sort applied,
 * the Comments sidebar must list them in top-to-bottom / left-to-right
 * reading order on every page: A, B, C, D.
 */
test.describe("Comments sidebar - annotation reading order", () => {
  test("annotations on each page are listed in visual reading order", async ({
    page,
  }) => {
    await page.goto("/read");
    await page.waitForLoadState("domcontentloaded");

    // Upload the test fixture via the hidden file input (avoids the native
    // file picker dialog).
    await page
      .locator('[data-testid="file-input"]')
      .first()
      .setInputFiles(ANNOTATED_PDF);

    // Sanity-check that the page indicator reflects a 3-page document.
    await expect(page.getByText(/\/\s*3/)).toBeVisible({ timeout: 30_000 });

    // Open the Comments sidebar via the WorkbenchBar button.
    const commentsBtn = page
      .getByRole("button", { name: /^Comments$/i })
      .first();
    if (
      !(await commentsBtn.isVisible({ timeout: 10_000 }).catch(() => false))
    ) {
      test.skip(true, "Comments button not visible on this build");
      return;
    }
    await commentsBtn.click();

    // Pull the rendered order out of the sidebar. Each comment card is
    // identified by `data-comment-card="${pageIndex}_${annotationId}"`.
    // The annotation `contents` text (e.g. "Annotation A on page 1") is
    // rendered inside the card and is the most reliable label to read.
    await expect
      .poll(
        async () => {
          return await page.evaluate(() => {
            const cards = Array.from(
              document.querySelectorAll<HTMLElement>("[data-comment-card]"),
            );
            return cards
              .map((c) => {
                const key = c.getAttribute("data-comment-card") || "";
                const pageIndex = Number(key.split("_")[0]);
                const text = (c.innerText || "").replace(/\s+/g, " ");
                const m = text.match(
                  /Annotation\s+([ABCD])\s+on\s+page\s+(\d+)/i,
                );
                return m
                  ? { pageIndex, label: m[1].toUpperCase(), text }
                  : { pageIndex, label: "?", text: text.slice(0, 80) };
              })
              .filter((e) => e.label !== "?");
          });
        },
        { timeout: 30_000, message: "waiting for 12 comment cards" },
      )
      .toHaveLength(12);

    const entries = await page.evaluate(() => {
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-comment-card]"),
      );
      return cards
        .map((c) => {
          const key = c.getAttribute("data-comment-card") || "";
          const pageIndex = Number(key.split("_")[0]);
          const text = (c.innerText || "").replace(/\s+/g, " ");
          const m = text.match(/Annotation\s+([ABCD])\s+on\s+page\s+(\d+)/i);
          return m && pageIndex === Number(m[2]) - 1
            ? { pageIndex, label: m[1].toUpperCase() }
            : null;
        })
        .filter((e): e is { pageIndex: number; label: string } => e !== null);
    });

    // Group labels by page in the order they appear in the sidebar.
    const byPage: Record<number, string[]> = {};
    for (const { pageIndex, label } of entries) {
      (byPage[pageIndex] ||= []).push(label);
    }

    // Each of the 3 pages must show A, B, C, D in that order.
    expect(byPage).toEqual({
      0: ["A", "B", "C", "D"],
      1: ["A", "B", "C", "D"],
      2: ["A", "B", "C", "D"],
    });
  });
});
