import { test, expect } from "@app/tests/helpers/stub-test-base";
import type { Locator, Page, Route } from "@playwright/test";

/** The AI agent docked at the foot of the file sidebar, and how it opens and closes. */

test.use({ autoGoto: false });

async function openEditorWithAi(page: Page): Promise<Locator> {
  await page.route("**/api/v1/config/app-config", (route: Route) =>
    route.fulfill({
      json: {
        enableLogin: false,
        isAdmin: false,
        enableAnalytics: false,
        languages: ["en_US"],
        defaultLocale: "en-US",
        aiEngineEnabled: true,
      },
    }),
  );
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  const dock = page.getByRole("region", { name: "Stirling Agent" });
  await expect(dock).toBeVisible();
  return dock;
}

async function dockHeight(dock: Locator): Promise<number> {
  const box = await dock.boundingBox();
  return box?.height ?? 0;
}

/** Waits out the expand/collapse transition so heights compare settled values. */
async function settledHeight(dock: Locator): Promise<number> {
  let previous = -1;
  let current = await dockHeight(dock);
  while (current !== previous) {
    previous = current;
    await dock.page().waitForTimeout(120);
    current = await dockHeight(dock);
  }
  return current;
}

test("sits collapsed with only the header and composer", async ({ page }) => {
  const dock = await openEditorWithAi(page);
  await expect(dock).toHaveAttribute("data-state", "collapsed");
  await expect(
    dock.getByRole("textbox", { name: "Ask Stirling" }),
  ).toBeVisible();
  // The collapsed conversation stays mounted but hidden from the a11y tree.
  await expect(
    dock.getByRole("button", { name: "Open from computer" }),
  ).toHaveCount(0);

  await dock.getByRole("textbox", { name: "Ask Stirling" }).click();
  await expect(
    dock.getByRole("button", { name: "Open from computer" }),
  ).toBeVisible();
});

test("grows when the composer is focused and shrinks once the user clicks away", async ({
  page,
}) => {
  const dock = await openEditorWithAi(page);
  const collapsed = await settledHeight(dock);

  await dock.getByRole("textbox", { name: "Ask Stirling" }).click();
  await expect(dock).toHaveAttribute("data-state", "focused");
  expect(await settledHeight(dock)).toBeGreaterThan(collapsed + 100);

  await page
    .locator('[data-tour="workbench"]')
    .click({ position: { x: 40, y: 200 } });
  await expect(dock).toHaveAttribute("data-state", "collapsed");
  expect(await settledHeight(dock)).toBe(collapsed);
});

test("stays open after a message is sent from the focused dock", async ({
  page,
}) => {
  await page.route("**/api/v1/ai/orchestrate/stream", (route: Route) =>
    route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body: `event: result\ndata: ${JSON.stringify({ outcome: "answer", answer: "Done." })}\n\n`,
    }),
  );
  const dock = await openEditorWithAi(page);
  const composer = dock.getByRole("textbox", { name: "Ask Stirling" });
  await composer.click();
  await composer.fill("Summarise this");
  await composer.press("Enter");
  await expect(dock).toHaveAttribute("data-state", "pinned");
  await expect(dock.getByText("Done.")).toBeVisible();

  await page
    .locator('[data-tour="workbench"]')
    .click({ position: { x: 40, y: 200 } });
  await expect(dock).toHaveAttribute("data-state", "pinned");
});

test("rules the header once messages scroll beneath it", async ({ page }) => {
  const answer = Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join(
    "\n\n",
  );
  await page.route("**/api/v1/ai/orchestrate/stream", (route: Route) =>
    route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body: `event: result\ndata: ${JSON.stringify({ outcome: "answer", answer })}\n\n`,
    }),
  );
  const dock = await openEditorWithAi(page);
  const header = dock.locator(".chat-dock__header");
  await expect(header).not.toHaveAttribute("data-scrolled");

  const composer = dock.getByRole("textbox", { name: "Ask Stirling" });
  await composer.click();
  await composer.fill("List forty lines");
  await composer.press("Enter");
  await expect(dock.getByText("Line 40")).toBeVisible();
  await expect(header).toHaveAttribute("data-scrolled");

  await dock.getByRole("button", { name: "Collapse chat" }).click();
  await expect(header).not.toHaveAttribute("data-scrolled");
});

test("stays open when expanded explicitly until it is collapsed", async ({
  page,
}) => {
  const dock = await openEditorWithAi(page);
  const collapsed = await settledHeight(dock);

  await dock.getByRole("button", { name: "Expand chat" }).click();
  await expect(dock).toHaveAttribute("data-state", "pinned");
  await expect(
    dock.getByRole("textbox", { name: "Ask Stirling" }),
  ).toBeFocused();

  await page
    .locator('[data-tour="workbench"]')
    .click({ position: { x: 40, y: 200 } });
  await expect(dock).toHaveAttribute("data-state", "pinned");

  await dock.getByRole("button", { name: "Collapse chat" }).click();
  await expect(dock).toHaveAttribute("data-state", "collapsed");
  expect(await settledHeight(dock)).toBe(collapsed);
});

test("opens to the same height whether focused or expanded", async ({
  page,
}) => {
  const dock = await openEditorWithAi(page);
  await dock.getByRole("textbox", { name: "Ask Stirling" }).click();
  const focused = await settledHeight(dock);

  await dock.getByRole("button", { name: "Collapse chat" }).click();
  await expect(dock).toHaveAttribute("data-state", "collapsed");

  await dock.getByRole("button", { name: "Expand chat" }).click();
  await expect(dock).toHaveAttribute("data-state", "pinned");
  expect(await settledHeight(dock)).toBe(focused);
});

test("Escape collapses it", async ({ page }) => {
  const dock = await openEditorWithAi(page);
  await dock.getByRole("textbox", { name: "Ask Stirling" }).click();
  await expect(dock).toHaveAttribute("data-state", "focused");
  await page.keyboard.press("Escape");
  await expect(dock).toHaveAttribute("data-state", "collapsed");
});

test("is absent when the AI engine is off", async ({ page }) => {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-sidebar="file-sidebar"]')).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Stirling Agent" }),
  ).toHaveCount(0);
});
