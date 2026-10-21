/**
 * Crop area cycle: open the tool, open the immersive editor, zoom, drag a
 * corner, close. One cycle per call; the harness repeats it.
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
    "../../../../src/core/tests/test-fixtures/sample.pdf",
  );

export const cropAreaCycle: Scenario = {
  id: "crop-area-cycle",
  name: "Crop · open the area editor, zoom, drag a corner, close",
  platform: "desktop-web",
  fixture: `${basename(DOCUMENT)} (50 KB, 2 pages, Letter)`,
  route: "/crop",
  async use(page: ScenarioPage): Promise<string> {
    await page.goto("/crop", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-tour="run-button"]', {
      state: "visible",
      timeout: 30_000,
    });

    const isCoarsePointer = await page
      .waitForFunction(
        assertSerializable(
          () => window.matchMedia("(pointer: coarse)").matches,
        ),
        null,
        { timeout: 3_000 },
      )
      .then(() => true)
      .catch(() => false);

    const hasFile = await page
      .locator('[data-testid="crop-canvas"] img')
      .count();
    if (hasFile === 0) {
      if (isCoarsePointer) {
        const chooserPromise = page.waitForEvent("filechooser");
        await page
          .getByText("Upload", { exact: true })
          .first()
          .click({ timeout: 10_000 });
        const chooser = await chooserPromise;
        await chooser.setFiles(DOCUMENT);
        await page
          .getByText("sample.pdf")
          .first()
          .waitFor({ state: "visible", timeout: 30_000 });
        // Uploading drops the mobile shell into the viewer; reopen the tool.
        await page.goto("/crop", { waitUntil: "domcontentloaded" });
        await page.waitForSelector('[data-tour="run-button"]', {
          state: "visible",
          timeout: 30_000,
        });
      } else {
        await page.getByTestId("files-button").click({ timeout: 10_000 });
        await page
          .locator('[data-testid="file-input"]')
          .setInputFiles(DOCUMENT);
      }
    }

    await page
      .waitForSelector('[data-testid="crop-canvas"]', {
        state: "visible",
        timeout: 20_000,
      })
      .catch(async () => {
        // The settings step can start collapsed after a mobile route change.
        await page
          .getByText("Select Crop Area")
          .first()
          .click({ timeout: 10_000 });
        await page.waitForSelector('[data-testid="crop-canvas"]', {
          state: "visible",
          timeout: 30_000,
        });
      });

    await page.waitForFunction(
      assertSerializable(() => {
        const canvas = document.querySelector<HTMLElement>(
          '[data-testid="crop-canvas"]',
        );
        const image = canvas?.querySelector<HTMLImageElement>("img");
        const selection = canvas?.querySelector<HTMLElement>(
          '[data-testid="crop-selection"]',
        );
        if (!image || !selection) return false;
        const box = selection.getBoundingClientRect();
        return image.complete && image.naturalWidth > 0 && box.width > 60;
      }),
      null,
      { timeout: 45_000 },
    );

    const tapTarget = page.getByRole("button", { name: /Open crop editor/i });
    if (await tapTarget.count()) {
      await tapTarget.first().click({ timeout: 10_000 });
    } else {
      await page
        .getByRole("button", { name: /Expand/i })
        .first()
        .click({ timeout: 10_000 });
    }
    await page.waitForSelector('[data-testid="crop-editor"]', {
      state: "visible",
      timeout: 20_000,
    });

    const editor = page.getByTestId("crop-editor");
    await editor
      .getByRole("button", { name: /Zoom in/i })
      .first()
      .click({ timeout: 10_000 });
    await page.waitForFunction(
      assertSerializable(() => {
        const label = document.querySelector<HTMLElement>(
          '[data-testid="crop-editor"] [class*="zoomLabel"]',
        );
        return Boolean(
          label && label.textContent && label.textContent !== "100%",
        );
      }),
      null,
      { timeout: 10_000 },
    );

    const handle = editor
      .getByTestId("crop-canvas")
      .locator('[data-handle="se"]')
      .first();
    const box = await handle.boundingBox();
    if (!box) throw new Error("crop handle has no box");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 52, startY - 64, { steps: 8 });
    await page.mouse.up();

    await editor
      .getByRole("button", { name: /^Done$/i })
      .first()
      .click({ timeout: 10_000 });
    await page.waitForSelector('[data-testid="crop-editor"]', {
      state: "detached",
      timeout: 10_000,
    });

    return "opened the tool, opened the editor, zoomed, dragged the SE corner, closed";
  },
};
