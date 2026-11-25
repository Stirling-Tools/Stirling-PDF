import path from "path";
import { expect, type Locator, type Page } from "@playwright/test";

type Upload = string | { name: string; mimeType: string; buffer: Buffer };

/** Marks the file list's rows from before an upload, so the new row stands out. */
const SEEN_ROW = "data-test-seen-row";

/** The file-list rows whose file is named exactly `name`. */
export function fileRows(page: Page, name: string) {
  return page.locator(".file-sidebar-file-item").filter({
    has: page.locator(".file-sidebar-file-name").getByText(name, {
      exact: true,
    }),
  });
}

/** Dispatches the click on the row's own eye button: the Recent list can
 * re-sort between the hover and a pointer click, hiding the button. */
export async function viewFileRow(row: Locator): Promise<void> {
  await row.hover();
  await row.locator(".file-sidebar-eye-btn").dispatchEvent("click");
}

/**
 * Adds `file` through the file list and returns its new row. A reopened saved
 * copy shares its name with the original, and the list's order is not one
 * to rely on, so the new row is the one that was not there before.
 */
async function addToFileList(page: Page, file: Upload) {
  await page.evaluate((attr) => {
    document
      .querySelectorAll(".file-sidebar-file-item")
      .forEach((el) => el.setAttribute(attr, ""));
  }, SEEN_ROW);
  await page.getByTestId("file-input").setInputFiles(file);
  const name = typeof file === "string" ? path.basename(file) : file.name;
  const added = fileRows(page, name).and(
    page.locator(`.file-sidebar-file-item:not([${SEEN_ROW}])`),
  );
  await expect(added).toHaveCount(1, { timeout: 30_000 });
  return added;
}

/** The zoom most specs' pixel geometry assumes. */
const DEFAULT_ZOOM_PERCENT = 150;

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
  // Phones have no file list; use the landing upload rather than a tool-specific picker.
  const hasSidebar = (await page.getByTestId("file-input").count()) > 0;
  let row = null;
  if (hasSidebar) {
    row = await addToFileList(page, file);
  } else {
    await page.getByTestId("landing-file-input").setInputFiles(file);
  }

  await expect
    .poll(
      async () => {
        // A reload can bring back the file viewed before it, so the document
        // must be this file's, not just a new one.
        const opened = await page.evaluate((fileName) => {
          const w = window as unknown as {
            __editor_store?: {
              document: unknown;
              source: { fileName: string | null };
            };
            __openedBefore?: unknown;
          };
          const doc = w.__editor_store?.document ?? null;
          return (
            doc != null &&
            doc !== w.__openedBefore &&
            w.__editor_store?.source.fileName === fileName
          );
        }, name);
        if (opened || !row) return opened;
        // Viewing a row that is already shown closes it, so only ask once.
        if (!(await row.evaluate((el) => el.classList.contains("viewed")))) {
          await viewFileRow(row);
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
  const row = await addToFileList(page, file);
  if (!(await row.evaluate((el) => el.classList.contains("viewed")))) {
    await viewFileRow(row);
  }
}

/** Shows an uploaded file in the viewer by its sidebar row's eye button. */
export async function viewInTextEditor(
  page: Page,
  name: string,
): Promise<void> {
  const row = fileRows(page, name).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  if (!(await row.evaluate((el) => el.classList.contains("viewed")))) {
    await viewFileRow(row);
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

/** No-op where the zoom box is not shown, as on a phone. */
export async function setViewerZoom(
  page: Page,
  percent: number,
): Promise<void> {
  const input = page.getByTestId("viewer-zoom-input").first();
  if (!(await input.isVisible())) return;
  // The viewer may still fit a newly opened document to its width just after,
  // so the zoom is set again until it holds.
  await expect(async () => {
    if ((await input.inputValue()) !== `${percent}%`) {
      await input.fill(String(percent));
      await input.press("Enter");
    }
    await expect(input).toHaveValue(`${percent}%`, { timeout: 10_000 });
  }).toPass({ timeout: 30_000 });
  // Zoom keeps the scroll position; start from the top, as a fresh open does.
  const firstPage = page.getByTestId("pdf-editor-page-0");
  await firstPage.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await expect(firstPage).toBeInViewport();
  await expect(input).toHaveValue(`${percent}%`);
}
