import type { Page, Route } from "@playwright/test";
import { test, expect } from "@editor/tests/helpers/stub-test-base";

async function stubUrlToPdfEnabled(
  page: Page,
  response: { json: boolean } | { status: number },
): Promise<void> {
  await page.route("**/api/v1/config/endpoint-enabled*", (route: Route) => {
    const endpoint = new URL(route.request().url()).searchParams.get(
      "endpoint",
    );
    if (endpoint !== "url-to-pdf") return route.fulfill({ json: true });
    return "json" in response
      ? route.fulfill({ json: response.json })
      : route.fulfill({ status: response.status, body: "" });
  });
}

test.use({ autoGoto: false });

test("a direct link to a disabled URL to PDF falls back to the tool picker", async ({
  page,
}) => {
  await stubUrlToPdfEnabled(page, { json: false });
  await page.goto("/url-to-pdf");
  await expect(page.locator('[data-tour="tool-button-merge"]')).toBeVisible();
  await expect(page.getByText(/Tool not found/)).toHaveCount(0);
  await expect(page.locator('[data-tour="tool-button-urlToPdf"]')).toHaveCount(
    0,
  );
});

test("a failed URL to PDF check hides the tool without an error toast", async ({
  page,
}) => {
  await stubUrlToPdfEnabled(page, { status: 500 });
  let failedChecks = 0;
  page.on("response", (response) => {
    if (response.url().includes("endpoint=url-to-pdf")) failedChecks += 1;
  });
  await page.goto("/editor");
  await expect.poll(() => failedChecks).toBeGreaterThanOrEqual(2);
  await expect(page.locator('[data-tour="tool-button-merge"]')).toBeVisible();
  expect(await page.getByText("Server error").count()).toBe(0);
});
