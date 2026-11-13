import { test, expect } from "@editor/tests/helpers/stub-test-base";
import type { Page, Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { uploadFiles } from "@editor/tests/helpers/ui-helpers";

const SAMPLE = path.join(import.meta.dirname, "../test-fixtures/sample.pdf");
const EXAMPLES_DIR = path.resolve(
  import.meta.dirname,
  "../../../../../../app/core/src/main/resources/static/pipeline/defaultWebUIConfigs",
);

interface ServerConfig {
  json: string;
  name: string;
}

function shippedExamples(): ServerConfig[] {
  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((f) => f.endsWith(".json.example"))
    .sort()
    .map((f) => {
      const json = fs.readFileSync(path.join(EXAMPLES_DIR, f), "utf8");
      return { json, name: (JSON.parse(json) as { name: string }).name };
    });
}

async function serveConfigs(
  page: Page,
  configs: ServerConfig[] | "fail",
): Promise<void> {
  await page.route("**/api/v1/ui-data/pipeline", (route: Route) =>
    configs === "fail"
      ? route.fulfill({ status: 500, contentType: "text/plain", body: "" })
      : route.fulfill({
          json: {
            pipelineConfigs: configs.map((c) => c.json),
            pipelineConfigsWithNames: configs,
          },
        }),
  );
}

async function gotoAutomate(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      indexedDB.deleteDatabase("StirlingPDF_Automations");
    } catch {
      return;
    }
  });
  await page.goto("/automate");
  await expect(page.getByText("Suggested", { exact: true })).toBeVisible();
}

test.describe("Automate: server pipeline configs", () => {
  for (const example of shippedExamples()) {
    test(`shipped example "${example.name}" lists and runs`, async ({
      page,
    }) => {
      const endpoints = (
        JSON.parse(example.json) as { pipeline: Array<{ operation: string }> }
      ).pipeline
        .map((step) => step.operation)
        .filter((op) => op.startsWith("/"));
      const posted: string[] = [];
      const pdf = fs.readFileSync(SAMPLE);
      for (const endpoint of new Set(endpoints)) {
        await page.route(`**${endpoint}`, (route: Route) => {
          posted.push(endpoint);
          return route.fulfill({
            status: 200,
            contentType: "application/pdf",
            body: pdf,
          });
        });
      }
      await serveConfigs(page, [example]);
      await gotoAutomate(page);

      const entry = page.getByRole("button", { name: example.name }).first();
      await entry.hover();
      await expect(
        page.getByText("Added by your administrator").first(),
      ).toBeVisible();
      await entry.click();
      await uploadFiles(page, SAMPLE);
      const run = page.getByRole("button", { name: /Run Automation/i });
      await expect(run).toBeEnabled();
      await run.click();

      await expect(page.getByRole("button", { name: "Undo" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(/not supported/i)).toHaveCount(0);
      expect(posted).toEqual(endpoints);
    });
  }

  test("a config with an unmapped step warns and cannot run", async ({
    page,
  }) => {
    await serveConfigs(page, [
      {
        name: "Legacy job",
        json: JSON.stringify({
          name: "Legacy job",
          pipeline: [
            { operation: "/api/v1/misc/repair", parameters: {} },
            { operation: "/api/v1/legacy/stamp-everything", parameters: {} },
          ],
        }),
      },
    ]);
    await gotoAutomate(page);

    await page.getByRole("button", { name: "Legacy job" }).first().click();
    await uploadFiles(page, SAMPLE);

    await expect(
      page.getByText(
        "Can't run: 1 unmapped operation: step 2 (/api/v1/legacy/stamp-everything)",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Run Automation/i }),
    ).toBeDisabled();
  });

  test("a failed load is shown instead of an empty list", async ({ page }) => {
    await serveConfigs(page, "fail");
    await gotoAutomate(page);

    await expect(
      page.getByText("Couldn't load your server's automations."),
    ).toBeVisible();
    await expect(page.getByText("Secure PDF Ingestion")).toBeVisible();
  });
});
