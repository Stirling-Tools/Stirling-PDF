import { test, expect } from "@editor/tests/helpers/stub-test-base";
import fs from "node:fs";
import path from "node:path";

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");
const MULTI_SAMPLE = path.join(
  import.meta.dirname,
  "../test-fixtures/multi-page-sample.pdf",
);
const SAMPLE_BYTES = fs.readFileSync(SAMPLE);

test("stages an attachment and saves its page pin", async ({ page }) => {
  await page.route("**/api/v1/misc/list-attachments", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/v1/misc/batch-process-attachments", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: SAMPLE_BYTES,
    }),
  );

  await page.goto("/add-attachments", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(SAMPLE);
  await expect(page.locator("[data-page-index]").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("attachment-pin-overlay")).toHaveCount(0);

  await page.locator("#attachments-input").setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("evidence"),
  });

  await page.locator('[data-testid^="attachment-pin-action-"]').first().click();
  await expect(page.getByTestId("attachment-pin-page")).toHaveCount(1);

  const pageBox = await page
    .getByTestId("attachment-pin-page")
    .first()
    .boundingBox();
  expect(pageBox).not.toBeNull();
  if (!pageBox) return;
  await page.mouse.click(
    pageBox.x + pageBox.width * 0.4,
    pageBox.y + pageBox.height * 0.55,
  );

  await expect(page.getByTestId("attachment-pin-link")).toBeVisible();
  await expect(page.getByText("P1", { exact: true })).toBeVisible();

  const saveRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/v1/misc/batch-process-attachments") &&
      request.method() === "POST",
  );
  await page.getByRole("button", { name: /Save Changes/ }).click();
  const request = await saveRequest;
  const body = request.postData() ?? "";
  expect(body).toContain('"pins"');
  expect(body).toContain('"filename":"evidence.txt"');
  expect(body).toContain('"pageIndex":0');
});

test("keeps the placement overlay inside the viewer while scrolling", async ({
  page,
}) => {
  await page.route("**/api/v1/misc/list-attachments", (route) =>
    route.fulfill({ json: [] }),
  );

  await page.goto("/add-attachments", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(MULTI_SAMPLE);
  await expect(page.locator("[data-page-index]").first()).toBeVisible({
    timeout: 15_000,
  });
  await page.locator("#attachments-input").setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("evidence"),
  });
  await page.locator('[data-testid^="attachment-pin-action-"]').first().click();
  await expect(page.getByTestId("attachment-pin-overlay")).toBeVisible();

  const readGeometry = () =>
    page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        return element?.getBoundingClientRect().toJSON() ?? null;
      };
      return {
        overlay: rect(".attachment-pin-overlay"),
        banner: rect(".attachment-pin-overlay__banner"),
        workbench: rect(".workbench-bar"),
        dock: rect(".pdf-viewer-toolbar-dock"),
      };
    });

  const before = await readGeometry();
  expect(before.overlay).not.toBeNull();
  expect(before.banner).not.toBeNull();
  expect(before.workbench).not.toBeNull();
  expect(before.dock).not.toBeNull();
  if (!before.overlay || !before.banner || !before.workbench || !before.dock) {
    return;
  }
  expect(before.overlay.top).toBeGreaterThanOrEqual(
    before.workbench.bottom - 1,
  );
  expect(before.overlay.bottom).toBeLessThanOrEqual(before.dock.top + 1);
  expect(before.banner.top).toBeGreaterThan(before.workbench.bottom);
  expect(before.banner.bottom).toBeLessThanOrEqual(before.overlay.bottom);

  const scrollState = await page.evaluate(() => {
    const pageElement =
      document.querySelector<HTMLElement>("[data-page-index]");
    let scroller = pageElement?.parentElement ?? null;
    while (
      scroller &&
      !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
    ) {
      scroller = scroller.parentElement;
    }
    if (!scroller) return null;
    const beforeScroll = scroller.scrollTop;
    scroller.scrollTop = 400;
    return { before: beforeScroll, after: scroller.scrollTop };
  });
  expect(scrollState).not.toBeNull();
  if (!scrollState) return;
  expect(scrollState.after).toBeGreaterThan(scrollState.before);

  await expect
    .poll(() =>
      page.evaluate((initialScrollTop) => {
        const pageElement =
          document.querySelector<HTMLElement>("[data-page-index]");
        const overlayPage = document.querySelector<HTMLElement>(
          '[data-testid="attachment-pin-page"]',
        );
        let scroller = pageElement?.parentElement ?? null;
        while (
          scroller &&
          !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
        ) {
          scroller = scroller.parentElement;
        }
        if (!pageElement || !overlayPage || !scroller) return false;
        const pageRect = pageElement.getBoundingClientRect();
        const overlayRect = overlayPage.getBoundingClientRect();
        return (
          scroller.scrollTop > initialScrollTop &&
          Math.abs(pageRect.top - overlayRect.top) < 1 &&
          Math.abs(pageRect.left - overlayRect.left) < 1 &&
          Math.abs(pageRect.width - overlayRect.width) < 1 &&
          Math.abs(pageRect.height - overlayRect.height) < 1
        );
      }, scrollState.before),
    )
    .toBe(true);

  const after = await readGeometry();
  expect(after.overlay?.top).toBe(before.overlay.top);
  expect(after.overlay?.bottom).toBe(before.overlay.bottom);
  expect(after.banner?.top).toBe(before.banner.top);
});

test("placed pin tracks page position when scrolled", async ({ page }) => {
  await page.route("**/api/v1/misc/list-attachments", (route) =>
    route.fulfill({ json: [] }),
  );

  await page.goto("/add-attachments", { waitUntil: "domcontentloaded" });
  await page.locator('input[type="file"]').first().setInputFiles(MULTI_SAMPLE);
  await expect(page.locator("[data-page-index]").first()).toBeVisible({
    timeout: 15_000,
  });

  await page.locator("#attachments-input").setInputFiles({
    name: "evidence.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("evidence"),
  });

  await page.locator('[data-testid^="attachment-pin-action-"]').first().click();
  await expect(page.getByTestId("attachment-pin-page")).toHaveCount(3);

  const pageBox = await page
    .getByTestId("attachment-pin-page")
    .first()
    .boundingBox();
  expect(pageBox).not.toBeNull();
  if (!pageBox) return;

  await page.mouse.click(
    pageBox.x + pageBox.width * 0.4,
    pageBox.y + pageBox.height * 0.55,
  );

  await expect(page.getByTestId("attachment-pin-link")).toBeVisible();
  const marker = page.locator(".attachment-pin-overlay__marker").first();
  await expect(marker).toBeVisible();

  const getPositions = () =>
    page.evaluate(() => {
      const pinEl = document.querySelector<HTMLElement>(
        ".attachment-pin-overlay__marker",
      );
      const pageEl = document.querySelector<HTMLElement>(
        '[data-page-index="0"]',
      );
      let scroller = pageEl?.parentElement ?? null;
      while (
        scroller &&
        !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
      ) {
        scroller = scroller.parentElement;
      }
      return {
        markerTop: pinEl?.getBoundingClientRect().top ?? 0,
        pageTop: pageEl?.getBoundingClientRect().top ?? 0,
        scrollerTop: scroller?.scrollTop ?? 0,
      };
    });

  const initial = await getPositions();

  await page.evaluate(() => {
    const pageEl = document.querySelector<HTMLElement>('[data-page-index="0"]');
    let scroller = pageEl?.parentElement ?? null;
    while (
      scroller &&
      !["auto", "scroll"].includes(getComputedStyle(scroller).overflowY)
    ) {
      scroller = scroller.parentElement;
    }
    if (scroller) {
      scroller.scrollTop += 350;
    }
  });

  await expect
    .poll(async () => {
      const current = await getPositions();
      const pageDelta = initial.pageTop - current.pageTop;
      const markerDelta = initial.markerTop - current.markerTop;
      return (
        current.scrollerTop > initial.scrollerTop &&
        Math.abs(pageDelta - markerDelta) < 2
      );
    })
    .toBe(true);
});
