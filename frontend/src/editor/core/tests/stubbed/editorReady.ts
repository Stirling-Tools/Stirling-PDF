import type { Page } from "@playwright/test";

interface ReadyWindow {
  __editor_store?: { state: { loading: boolean; firstPageRendered: boolean } };
}

/** Wait until the editor has finished loading and painted page 0. */
export async function waitForEditorReady(
  page: Page,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = (window as unknown as ReadyWindow).__editor_store?.state;
      return !!state && state.firstPageRendered && !state.loading;
    },
    undefined,
    { timeout },
  );
}
