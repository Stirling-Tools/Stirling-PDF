import fs from "node:fs";
import path from "path";
import { test, expect } from "@app/tests/helpers/stub-test-base";

interface SteadyZoomSamplerState {
  stop: boolean;
  widths: number[];
  indicators: string[];
}

declare global {
  interface Window {
    __steadySampler?: SteadyZoomSamplerState;
  }
}

const FIXTURES = path.join(import.meta.dirname, "../test-fixtures");
const MULTIPAGE_PDF = path.join(FIXTURES, "annotations_out_of_order.pdf");
const ROTATED_TEXT_PDF = path.join(FIXTURES, "rotated-text-sample.pdf");
const ROTATED_PAGES_PDF = path.join(FIXTURES, "rotated-pages.pdf");
const FORM_PDF = path.join(FIXTURES, "form-fields-sample.pdf");

async function loadFixture(
  page: import("@playwright/test").Page,
  fixture: string,
  pages = 1,
) {
  await page.goto("/editor");
  await page.locator('input[type="file"]').first().setInputFiles(fixture);
  await expect(page.locator('[data-page-index="0"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(pages);
  await page.waitForTimeout(2_000);
}

function pageTopOf(
  page: import("@playwright/test").Page,
  index: number,
): Promise<number> {
  return page
    .locator(`[data-page-index="${index}"]`)
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().top));
}

async function highlightAllText(page: import("@playwright/test").Page) {
  const point = await page.evaluate(() => {
    let best: { x: number; y: number; area: number } | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(
      "[data-page-index]",
    )) {
      const rect = el.getBoundingClientRect();
      const left = Math.max(0, Math.min(rect.left, window.innerWidth));
      const top = Math.max(0, Math.min(rect.top, window.innerHeight));
      const right = Math.max(0, Math.min(rect.right, window.innerWidth));
      const bottom = Math.max(0, Math.min(rect.bottom, window.innerHeight));
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      if (!best || area > best.area) {
        best = { x: (left + right) / 2, y: (top + bottom) / 2, area };
      }
    }
    return best && best.area > 0 ? { x: best.x, y: best.y } : null;
  });
  if (!point) throw new Error("No visible page to hover");
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+A");
  await page.waitForTimeout(600);
  const highlight = page
    .locator('[data-text-selection-menu] button[aria-label="Highlight"]')
    .first();
  await expect(highlight).toBeVisible({ timeout: 5_000 });
  await highlight.click();
  await page.waitForTimeout(1_500);
}

async function saveChanges(page: import("@playwright/test").Page) {
  const save = page.getByRole("button", { name: "Save Changes" }).first();
  await expect(save).toBeEnabled({ timeout: 15_000 });
  await save.click();
  await expect(save).toBeDisabled({ timeout: 20_000 });
}

async function mockCompress(
  page: import("@playwright/test").Page,
  fixture: string,
) {
  await page.route("**/api/v1/misc/compress-pdf", async (route) => {
    const bytes = await fs.promises.readFile(fixture);
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: bytes,
      headers: {
        "Content-Disposition": 'attachment; filename="compressed.pdf"',
      },
    });
  });
}

/** Opens the Compress tool page without running it, so the caller can capture
 *  the position the tool output has to preserve. */
async function openCompressPanel(page: import("@playwright/test").Page) {
  await page
    .getByRole("button", { name: "Redact", exact: true })
    .first()
    .click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Back to all tools" }).first().click();
  await page.waitForTimeout(800);
  await page
    .getByRole("link", { name: "Compress", exact: true })
    .first()
    .click();
  await page.waitForTimeout(1_500);
}

async function applyCompress(page: import("@playwright/test").Page) {
  await page.locator("[data-page-index]").evaluateAll((pages) => {
    for (const node of pages) node.setAttribute("data-outgoing-page", "true");
  });
  const response = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/misc/compress-pdf") && response.ok(),
  );
  await page
    .getByRole("button", { name: "Compress", exact: true })
    .first()
    .click();
  await response;
  // Page counts and toolbar values can still describe the outgoing document.
  await expect(page.locator("[data-outgoing-page]")).toHaveCount(0, {
    timeout: 30_000,
  });
}

test("a rotated document saves annotations without reopening", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loadFixture(page, ROTATED_TEXT_PDF);
  await highlightAllText(page);

  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-page-index]")) {
      el.setAttribute("data-matrix-page-probe", "1");
    }
  });
  const pageCount = await page.locator("[data-page-index]").count();

  await saveChanges(page);

  // The live document survives, so no page node may be replaced.
  expect(
    await page.evaluate(
      () =>
        document.querySelectorAll('[data-matrix-page-probe="1"]').length ===
        document.querySelectorAll("[data-page-index]").length,
    ),
  ).toBe(true);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 15_000 })
    .toBe(pageCount);
});

test("rotated and landscape pages reload a tool output in place", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await loadFixture(page, ROTATED_PAGES_PDF, 4);
  await page.getByRole("button", { name: "Next Page" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Zoom In" }).first().click();
  await page.waitForTimeout(500);
  await page.mouse.wheel(0, 200);
  await page.waitForTimeout(500);

  await mockCompress(page, ROTATED_PAGES_PDF);
  await openCompressPanel(page);
  const topBefore = await pageTopOf(page, 1);
  const zoomBefore = await page.getByText(/%$/).first().textContent();
  await applyCompress(page);

  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 60_000 })
    .toBe(4);
  await expect
    .poll(async () => Math.abs((await pageTopOf(page, 1)) - topBefore), {
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(3);
  await expect
    .poll(async () => page.getByText(/%$/).first().textContent(), {
      timeout: 15_000,
    })
    .toBe(zoomBefore);
});

test("dual page view survives a save and a tool output", async ({
  page,
  browserName,
}) => {
  test.setTimeout(300_000);
  await loadFixture(page, MULTIPAGE_PDF, 3);

  await page.getByRole("button", { name: "Dual Page View" }).first().click();
  await expect(
    page.getByRole("button", { name: "Single Page View" }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await highlightAllText(page);
  await saveChanges(page);
  await expect(
    page.getByRole("button", { name: "Single Page View" }).first(),
  ).toBeVisible({ timeout: 15_000 });

  await mockCompress(page, MULTIPAGE_PDF);
  await openCompressPanel(page);
  if (browserName === "chromium") {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  const topBefore = await pageTopOf(page, 0);
  const zoomBefore = await page.getByText(/%$/).first().textContent();
  await applyCompress(page);

  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 60_000 })
    .toBe(3);
  // Either page in a dual spread can be reported as current; its geometry is
  // the reading position, not the page counter's tie-break between neighbours.
  await expect(
    page.getByRole("button", { name: "Single Page View" }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => Math.abs((await pageTopOf(page, 0)) - topBefore), {
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(3);
  await expect(page.getByText(/%$/).first()).toHaveText(zoomBefore ?? "");
});

test("a tool output keeps the page width and zoom readout steady", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await loadFixture(page, MULTIPAGE_PDF, 3);
  const widthBefore = await page
    .locator('[data-page-index="0"]')
    .first()
    .evaluate((el) => Math.round(el.getBoundingClientRect().width));

  await mockCompress(page, MULTIPAGE_PDF);
  await openCompressPanel(page);
  await page.evaluate(() => {
    const state: SteadyZoomSamplerState = {
      stop: false,
      widths: [],
      indicators: [],
    };
    window.__steadySampler = state;
    const isRendered = (el: HTMLElement): boolean => {
      try {
        return el.checkVisibility({ checkVisibilityCSS: true });
      } catch {
        return el.getBoundingClientRect().width > 0;
      }
    };
    const tick = () => {
      if (state.stop) return;
      const pageEl = document.querySelector<HTMLElement>(
        '[data-page-index="0"]',
      );
      // Only painted frames count: the swap hides the scroller while the
      // carried zoom lands, and hidden layout is not a visible flash.
      if (pageEl && isRendered(pageEl))
        state.widths.push(Math.round(pageEl.getBoundingClientRect().width));
      const indicator = Array.from(
        document.querySelectorAll<HTMLElement>("span,div,input"),
      ).find((el) =>
        /^\d+%$/.test(
          (el.textContent ?? el.getAttribute("value") ?? "").trim(),
        ),
      );
      if (indicator) {
        state.indicators.push(
          (
            indicator.textContent ??
            indicator.getAttribute("value") ??
            ""
          ).trim(),
        );
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  await applyCompress(page);
  await page.waitForTimeout(4_000);

  const sampled = await page.evaluate(() => {
    const state = window.__steadySampler;
    if (!state) return { widths: [], indicators: [] };
    state.stop = true;
    return { widths: state.widths, indicators: state.indicators };
  });

  // The swap resolves the carried zoom while the scroller is hidden, so no
  // frame may render a different page width and the readout must not move.
  const widths = sampled.widths.filter((width) => width > 0);
  expect(widths.length).toBeGreaterThan(0);
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(4);
  expect(new Set(sampled.indicators).size).toBeLessThanOrEqual(1);
  await expect
    .poll(
      async () =>
        Math.abs(
          widthBefore -
            (await page
              .locator('[data-page-index="0"]')
              .first()
              .evaluate((el) => Math.round(el.getBoundingClientRect().width))),
        ) <= 4,
      { timeout: 10_000 },
    )
    .toBe(true);
});

test("a manual zoom survives a save and a tool output", async ({ page }) => {
  test.setTimeout(300_000);
  await loadFixture(page, MULTIPAGE_PDF, 3);
  await highlightAllText(page);

  await page.getByRole("button", { name: "Next Page" }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Zoom In" }).first().click();
  await page.waitForTimeout(400);
  const zoomBefore = await page.getByText(/%$/).first().textContent();
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(400);

  await saveChanges(page);
  await expect
    .poll(async () => page.getByText(/%$/).first().textContent(), {
      timeout: 15_000,
    })
    .toBe(zoomBefore);

  await mockCompress(page, MULTIPAGE_PDF);
  await openCompressPanel(page);
  await applyCompress(page);

  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 60_000 })
    .toBe(3);
  // The manual zoom is carried across the reload. The page the tool panel
  // leaves the viewer on is not asserted here; the rotated case covers that.
  await expect
    .poll(async () => page.getByText(/%$/).first().textContent(), {
      timeout: 15_000,
    })
    .toBe(zoomBefore);
});

test("a form apply keeps a fit-page zoom", async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      "stirlingpdf_preferences",
      JSON.stringify({ defaultViewerZoom: "fitPage" }),
    );
  });
  const fieldValue = "value 1";
  await page.route("**/api/v1/form/fields-with-coordinates", (route) =>
    route.fulfill({
      json: [
        {
          name: "name_1",
          label: "Name 1",
          type: "text",
          value: fieldValue,
          options: null,
          displayOptions: null,
          required: false,
          readOnly: false,
          multiSelect: false,
          multiline: false,
          tooltip: null,
          widgets: [
            {
              pageIndex: 0,
              x: 48,
              y: 120,
              width: 300,
              height: 24,
              fontSize: 12,
              cropBoxHeight: 792,
            },
          ],
        },
      ],
    }),
  );

  await loadFixture(page, FORM_PDF, 2);

  const pageWidth = () =>
    page
      .locator('[data-page-index="0"]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width));
  const pageTop = () =>
    page
      .locator('[data-page-index="0"]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().top));

  // The preference-driven zoom lands a beat after the document renders.
  const stable = async (read: () => Promise<number>) => {
    let previous = Number.NaN;
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = await read();
      if (Math.abs(current - previous) <= 1) return current;
      previous = current;
      await page.waitForTimeout(100);
    }
    return previous;
  };
  const field = page
    .locator('[data-page-index="0"] input[type="text"]')
    .first();
  await expect(field).toBeVisible({ timeout: 20_000 });
  await field.fill("updated value");
  await page.keyboard.press("Tab");

  // Filling can scroll the field into view, so the baseline is read once the
  // edit is done, right before the apply.
  const widthBefore = await stable(pageWidth);
  const topBefore = await stable(pageTop);
  await page.getByRole("button", { name: "Apply Changes" }).first().click();

  // A replacement used to open at the plugin's fit-width default while the
  // preference was fit page, which read as the zoom changing after apply.
  await expect
    .poll(async () => Math.abs((await pageWidth()) - widthBefore), {
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(3);
  await expect
    .poll(async () => Math.abs((await pageTop()) - topBefore), {
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(3);
});

test("a form apply reloads the new value and keeps the position", async ({
  page,
}) => {
  test.setTimeout(300_000);
  let fieldValue = "value 1";
  await page.route("**/api/v1/form/fields-with-coordinates", (route) =>
    route.fulfill({
      json: [
        {
          name: "name_1",
          label: "Name 1",
          type: "text",
          value: fieldValue,
          options: null,
          displayOptions: null,
          required: false,
          readOnly: false,
          multiSelect: false,
          multiline: false,
          tooltip: null,
          widgets: [
            {
              pageIndex: 0,
              x: 48,
              y: 120,
              width: 300,
              height: 24,
              fontSize: 12,
              cropBoxHeight: 792,
            },
          ],
        },
      ],
    }),
  );
  await page.route("**/api/v1/form/edit-fields**", async (route) => {
    fieldValue = "updated value";
    const bytes = await fs.promises.readFile(FORM_PDF);
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: bytes,
      headers: { "Content-Disposition": 'attachment; filename="form.pdf"' },
    });
  });

  // The normal viewer shows form overlays; the save bar only exists outside
  // the form tool, which is the path users hit when filling a downloaded form.
  await loadFixture(page, FORM_PDF, 2);
  await page.getByRole("button", { name: "Zoom In" }).first().click();
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(400);
  const field = page
    .locator('[data-page-index="0"] input[type="text"]')
    .first();
  await expect(field).toBeVisible({ timeout: 20_000 });
  await field.fill("updated value");
  // Tab can start an asynchronous scroll to the next field in WebKit.
  await field.blur();

  // Filling can scroll the field into view, so the baseline is read once the
  // edit is done, right before the apply.
  const zoomBefore = await page.getByText(/%$/).first().textContent();
  const pageTopBefore = await pageTopOf(page, 0);
  const apply = page.getByRole("button", { name: "Apply Changes" }).first();
  await apply.click();
  await expect(apply).toBeHidden({ timeout: 20_000 });

  // The reloaded document carries the value the round trip produced, and the
  // apply does not rescale the page or move the reader.
  await expect(field).toHaveValue("updated value", { timeout: 20_000 });
  await expect
    .poll(async () => page.getByText(/%$/).first().textContent(), {
      timeout: 15_000,
    })
    .toBe(zoomBefore);
  await expect
    .poll(async () => Math.abs((await pageTopOf(page, 0)) - pageTopBefore), {
      timeout: 15_000,
    })
    .toBeLessThanOrEqual(3);
  await expect
    .poll(() => page.locator("[data-page-index]").count(), { timeout: 15_000 })
    .toBe(2);
});
