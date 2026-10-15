/**
 * Text editor raster cycle: load a document, change zoom, scroll, leave.
 *
 * One open/use/close cycle, because the harness repeats it and measures the
 * whole window. Readiness is the editor's own store (it renders page 0 only
 * after the wasm raster pass), never a clock. Page functions carry no module
 * scope, so every literal they need is written inside them.
 */
import { basename, resolve } from "node:path";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { assertSerializable } from "../serialize";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { Scenario, ScenarioPage } from "../types";

const DOCUMENT =
  process.env.WALKTHROUGH_FIXTURE ??
  resolve(
    import.meta.dirname,
    "../../../../src/core/tests/test-fixtures/user-sample.pdf",
  );

export const textEditorRasterCycle: Scenario = {
  id: "text-editor-raster-cycle",
  name: "PDF text editor · load a document, zoom, scroll, leave",
  platform: "desktop-web",
  fixture: `${basename(DOCUMENT)} (258.6 KB, text fixture)`,
  route: "/pdf-text-editor",
  async use(page: ScenarioPage): Promise<string> {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
    await page.getByTestId("pdf-editor-root").waitFor({
      state: "visible",
      timeout: 60_000,
    });

    await page.getByTestId("pdf-editor-file-input").setInputFiles(DOCUMENT);
    await page.waitForFunction(
      assertSerializable(() => {
        const state = (
          window as unknown as {
            __editor_store?: {
              state: { loading: boolean; firstPageRendered: boolean };
            };
          }
        ).__editor_store?.state;
        return Boolean(state && state.firstPageRendered && !state.loading);
      }),
      null,
      { timeout: 90_000 },
    );

    // Zoom re-rasterises page 0, which is the path this work changes. The
    // pre-click reading goes into a page global: a page function cannot take
    // an argument, so it cannot be passed in.
    await page.waitForFunction(
      assertSerializable(() => {
        const el = document.querySelector(
          '[data-testid="pdf-editor-zoom-percent"]',
        );
        const scope = window as unknown as { __wtZoomPercent?: string };
        if (!el || !el.textContent) return false;
        scope.__wtZoomPercent = el.textContent;
        return true;
      }),
      null,
      { timeout: 20_000 },
    );
    await page.getByTestId("pdf-editor-zoom-in").click();
    await page.getByTestId("pdf-editor-zoom-in").click();
    await page.waitForFunction(
      assertSerializable(() => {
        const el = document.querySelector(
          '[data-testid="pdf-editor-zoom-percent"]',
        );
        const scope = window as unknown as { __wtZoomPercent?: string };
        return Boolean(
          el &&
          el.textContent &&
          scope.__wtZoomPercent !== undefined &&
          scope.__wtZoomPercent !== el.textContent,
        );
      }),
      null,
      { timeout: 30_000 },
    );

    await page
      .locator('[data-testid="pdf-editor-pages"]')
      .first()
      .waitFor({ timeout: 20_000 });
    await page.mouse.wheel(0, 1200);

    // Close: leaving the route tears the editor down and releases its rasters.
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    return "editor opened with a document, zoomed twice, scrolled, then left";
  },
};

export const BUILTIN_SCENARIOS = [textEditorRasterCycle];
