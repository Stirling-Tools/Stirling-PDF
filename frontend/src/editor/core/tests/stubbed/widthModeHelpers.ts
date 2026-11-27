import { expect } from "@editor/tests/helpers/stub-test-base";
import type { Page } from "@playwright/test";

/** Switch the PDF text editor to Wrap width mode. */
export async function selectWrapWidthMode(page: Page): Promise<void> {
  await page.getByTestId("pdf-editor-advanced-toggle").click();
  const wrap = page
    .getByTestId("pdf-editor-width-mode-control")
    .getByText("Wrap", { exact: true });
  // A click landing while the Advanced section is still opening can be dropped.
  await expect(async () => {
    await wrap.click({ timeout: 2_000 });
    expect(await readWidthMode(page)).toBe("wrap");
  }).toPass({ timeout: 15_000 });
}

function readWidthMode(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __editor_store: { state: { widthMode: string } };
        }
      ).__editor_store.state.widthMode,
  );
}
