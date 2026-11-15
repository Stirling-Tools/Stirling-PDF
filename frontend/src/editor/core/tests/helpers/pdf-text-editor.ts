import path from "path";
import { expect, type Page } from "@playwright/test";

type Upload = string | { name: string; mimeType: string; buffer: Buffer };

/** The zoom most specs' pixel geometry assumes. */
const DEFAULT_ZOOM_PERCENT = 150;
/** The viewer's zoom slider: 20% to 500% in steps of 5. */
const SLIDER_MIN = 20;
const SLIDER_STEP = 5;

/**
 * Opens `file` in the PDF text editor the way a user does: add it to the
 * workspace, show it in the viewer, and let the editor follow. Works for a
 * first open and for reopening a saved copy while another document is open.
 * The viewer is then zoomed to `zoomPercent`; null leaves its own fit.
 */
export async function openInTextEditor(
  page: Page,
  file: Upload,
  { zoomPercent = DEFAULT_ZOOM_PERCENT }: { zoomPercent?: number | null } = {},
): Promise<void> {
  if (
    !new URL(page.url(), "http://x").pathname.startsWith("/pdf-text-editor")
  ) {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  }
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  await page.evaluate(() => {
    const w = window as unknown as {
      __editor_store?: { document: unknown };
      __openedBefore?: unknown;
    };
    w.__openedBefore = w.__editor_store?.document ?? null;
  });

  const name = typeof file === "string" ? path.basename(file) : file.name;
  // Phones have no file list; any of the app's own upload inputs adds the file.
  const sidebarInput = page.getByTestId("file-input");
  const hasSidebar = (await sidebarInput.count()) > 0;
  await (
    hasSidebar
      ? sidebarInput
      : page
          .locator(
            'input[type="file"]:not([data-testid="pdf-editor-image-input"])',
          )
          .first()
  ).setInputFiles(file);
  // The newest row for this name is the copy just added.
  const row = page
    .locator(".file-sidebar-file-item")
    .filter({ hasText: name })
    .first();
  if (hasSidebar) await expect(row).toBeVisible({ timeout: 30_000 });

  await expect
    .poll(
      async () => {
        const opened = await page.evaluate(() => {
          const w = window as unknown as {
            __editor_store?: { document: unknown };
            __openedBefore?: unknown;
          };
          const doc = w.__editor_store?.document ?? null;
          return doc != null && doc !== w.__openedBefore;
        });
        if (opened || !hasSidebar) return opened;
        // Viewing a row that is already shown closes it, so only ask once.
        if (!(await row.evaluate((el) => el.classList.contains("viewed")))) {
          await row.hover();
          await row.locator(".file-sidebar-eye-btn").click();
        }
        return false;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe(true);
  await expect(page.getByTestId("pdf-editor-page-0")).toBeVisible({
    timeout: 60_000,
  });
  if (zoomPercent != null) await setViewerZoom(page, zoomPercent);
}

/**
 * Adds `file` to the workspace and shows it in the viewer, without waiting for
 * the editor to open it: for files it refuses, or that ask for a password.
 */
export async function showInTextEditor(
  page: Page,
  file: Upload,
): Promise<void> {
  if (
    !new URL(page.url(), "http://x").pathname.startsWith("/pdf-text-editor")
  ) {
    await page.goto("/pdf-text-editor", { waitUntil: "domcontentloaded" });
  }
  await expect(page.getByTestId("pdf-editor-root")).toBeVisible({
    timeout: 30_000,
  });
  const name = typeof file === "string" ? path.basename(file) : file.name;
  await page.getByTestId("file-input").setInputFiles(file);
  const row = page
    .locator(".file-sidebar-file-item")
    .filter({ hasText: name })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  if (!(await row.evaluate((el) => el.classList.contains("viewed")))) {
    await row.hover();
    await row.locator(".file-sidebar-eye-btn").click();
  }
}

/**
 * Scrolls page `pageIndex` to the middle of the viewer. The viewer mounts only
 * the pages near the viewport, so a far page is reached by scrolling toward it
 * until it mounts.
 */
export async function scrollToEditorPage(
  page: Page,
  pageIndex: number,
): Promise<void> {
  await page.evaluate(async (target) => {
    const indexOf = (el: HTMLElement) =>
      /^pdf-editor-page-(\d+)$/.exec(el.dataset.testid ?? "");
    for (let step = 0; step < 200; step++) {
      const el = document.querySelector<HTMLElement>(
        `[data-testid="pdf-editor-page-${target}"]`,
      );
      if (el) {
        el.scrollIntoView({ block: "center" });
        return;
      }
      const mounted = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-testid^='pdf-editor-page-']",
        ),
      ).filter((e) => indexOf(e) != null);
      if (mounted.length === 0) throw new Error("no editor page is mounted");
      let scroller = mounted[0].parentElement;
      while (
        scroller &&
        !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
      ) {
        scroller = scroller.parentElement;
      }
      if (!scroller) throw new Error("viewer scroll container not found");
      const highest = Math.max(...mounted.map((e) => Number(indexOf(e)![1])));
      scroller.scrollTop += (highest < target ? 1 : -1) * scroller.clientHeight;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`page ${target} never mounted`);
  }, pageIndex);
}

/** No-op where the slider is not shown: on a phone, or in a narrow viewer bar. */
export async function setViewerZoom(
  page: Page,
  percent: number,
): Promise<void> {
  const thumb = page
    .locator(".pdf-viewer-toolbar-zoom-slider [role=slider]")
    .first();
  if (!(await thumb.isVisible())) return;
  await thumb.focus();
  await page.keyboard.press("Home");
  for (let i = 0; i < (percent - SLIDER_MIN) / SLIDER_STEP; i++) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(thumb).toHaveAttribute("aria-valuenow", String(percent));
  await page.waitForTimeout(800);
  // Zoom keeps the scroll position; start from the top, as a fresh open does.
  await page
    .getByTestId("pdf-editor-page-0")
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(400);
}
