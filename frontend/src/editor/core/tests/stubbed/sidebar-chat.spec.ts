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

test("sits collapsed as just the composer", async ({ page }) => {
  const dock = await openEditorWithAi(page);
  await expect(dock).toHaveAttribute("data-state", "collapsed");
  await expect(
    dock.getByRole("textbox", { name: "Ask Stirling Agent" }),
  ).toBeVisible();
  await expect(dock.getByRole("button", { name: "Collapse chat" })).toHaveCount(
    0,
  );
  // The collapsed conversation stays mounted but hidden from the a11y tree.
  await expect(
    dock.getByRole("button", { name: "Open from computer" }),
  ).toHaveCount(0);

  await dock.getByRole("textbox", { name: "Ask Stirling Agent" }).click();
  await expect(
    dock.getByRole("button", { name: "Open from computer" }),
  ).toBeVisible();
});

test("opens when the composer is focused and closes only from the chevron", async ({
  page,
}) => {
  const dock = await openEditorWithAi(page);
  const collapsed = await settledHeight(dock);

  await dock.getByRole("textbox", { name: "Ask Stirling Agent" }).click();
  await expect(dock).toHaveAttribute("data-state", "expanded");
  expect(await settledHeight(dock)).toBeGreaterThan(collapsed + 100);

  await page
    .locator('[data-tour="workbench"]')
    .click({ position: { x: 40, y: 200 } });
  await expect(dock).toHaveAttribute("data-state", "expanded");

  await dock.getByRole("button", { name: "Collapse chat" }).click();
  await expect(dock).toHaveAttribute("data-state", "collapsed");
  expect(await settledHeight(dock)).toBe(collapsed);

  await dock.getByRole("textbox", { name: "Ask Stirling Agent" }).click();
  await expect(dock).toHaveAttribute("data-state", "expanded");
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
  const header = dock.locator(".file-sidebar-section-header");
  await expect(header).not.toHaveAttribute("data-scrolled");

  const composer = dock.getByRole("textbox", { name: "Ask Stirling Agent" });
  await composer.click();
  await composer.fill("List forty lines");
  await composer.press("Enter");
  await expect(dock.getByText("Line 40")).toBeVisible();
  await expect(header).toHaveAttribute("data-scrolled");

  await dock.getByRole("button", { name: "Collapse chat" }).click();
  await expect(header).not.toHaveAttribute("data-scrolled");
});

test("accepts typing while the agent is thinking but holds the send", async ({
  page,
}) => {
  let releaseReply = () => {};
  const replyReleased = new Promise<void>((resolve) => {
    releaseReply = resolve;
  });
  let requests = 0;
  await page.route("**/api/v1/ai/orchestrate/stream", async (route: Route) => {
    requests += 1;
    await replyReleased;
    await route.fulfill({
      headers: { "content-type": "text/event-stream" },
      body: `event: result\ndata: ${JSON.stringify({ outcome: "answer", answer: "Done." })}\n\n`,
    });
  });
  const dock = await openEditorWithAi(page);
  const composer = dock.getByRole("textbox", { name: "Ask Stirling Agent" });
  const send = dock.getByRole("button", { name: "Send message" });
  await composer.click();
  await composer.fill("First");
  await composer.press("Enter");

  await composer.fill("Second");
  await expect(composer).toHaveValue("Second");
  await expect(send).toBeDisabled();
  await composer.press("Enter");
  await expect(composer).toHaveValue("Second");

  releaseReply();
  await expect(dock.getByText("Done.")).toBeVisible();
  await expect(send).toBeEnabled();
  expect(requests).toBe(1);
});

test("is absent when the AI engine is off", async ({ page }) => {
  await page.goto("/editor", { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-sidebar="file-sidebar"]')).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Stirling Agent" }),
  ).toHaveCount(0);
});
