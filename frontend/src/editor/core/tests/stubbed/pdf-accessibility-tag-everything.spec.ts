import path from "path";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

// The tool panel's Tag everything button hands the file to the review, which
// tags every page; it works even when the check itself could not run.

const UNTAGGED = path.join(
  import.meta.dirname,
  "../test-fixtures/paragraph-sample.pdf",
);

interface EditorWindow {
  __editor_store?: {
    state: { dirty: boolean };
    document: {
      structure: (pageIndex: number) => { addedElements: () => unknown[] };
    } | null;
  };
}

test("tags every page from the tool panel when the check can't reach the server", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.route("**/api/v1/security/accessibility-report", (route) =>
    route.abort("connectionrefused"),
  );
  await page.getByTestId("file-input").setInputFiles(UNTAGGED);
  await page
    .getByText("PDF accessibility", { exact: true })
    .first()
    .click({ timeout: 60_000 });

  const results = page.getByTestId("a11y-results");
  await expect(results).toContainText("The server didn't answer", {
    timeout: 30_000,
  });
  const tagEverything = page.getByTestId("a11y-tag-everything");
  await tagEverything.click();

  await expect(page.getByTestId("pdf-editor-quick-tag")).toBeVisible({
    timeout: 30_000,
  });
  const addedTags = () =>
    page.evaluate(
      () =>
        (window as unknown as EditorWindow).__editor_store?.document
          ?.structure(0)
          .addedElements().length ?? 0,
    );
  await expect.poll(addedTags, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => (window as unknown as EditorWindow).__editor_store?.state.dirty,
    ),
  ).toBe(true);
  await expect(tagEverything).toBeEnabled();
});
