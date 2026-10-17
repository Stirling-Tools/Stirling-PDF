/**
 * Colour-control cycle: load a document, open a tool whose settings carry
 * Mantine's colour controls, drive them, and leave.
 *
 * The document input is the file sidebar's; the tool's own settings step mounts
 * only once FileContext holds a file, and its colour fields appear only after
 * the operation is switched to `Custom`. Readiness is always a condition on the
 * app — never a clock — because the harness repeats this cycle inside one
 * measured window.
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

const TOOL_ROUTE = "/replace-color";
const SETTINGS_SELECT = ".tool-panel input.mantine-Select-input";
const COLOR_INPUT = "input.mantine-ColorInput-input";

export const toolColorControls: Scenario = {
  id: "tool-colour-controls",
  name: "Tool · load a document, drive the colour controls, leave",
  platform: "desktop-web",
  fixture: `${basename(DOCUMENT)} (colour controls in tool settings)`,
  route: TOOL_ROUTE,
  async use(page: ScenarioPage): Promise<string> {
    await page.goto(TOOL_ROUTE, { waitUntil: "domcontentloaded" });
    await page.getByTestId("file-input").setInputFiles(DOCUMENT);

    await page.waitForSelector(SETTINGS_SELECT, {
      state: "visible",
      timeout: 60_000,
    });
    await page.locator(SETTINGS_SELECT).first().click();
    await page.waitForSelector('[role="option"]', {
      state: "visible",
      timeout: 10_000,
    });
    await page
      .locator('[role="option"]')
      .filter({ hasText: /custom/i })
      .first()
      .click();

    // Both colour fields must paint: the rewrite moves the component into its
    // own chunk, so a stale or duplicated module would show up as a missing
    // field here rather than as a wrong colour.
    await page.waitForFunction(
      assertSerializable(() => {
        return (
          Array.from(document.querySelectorAll("input.mantine-ColorInput-input")).filter(
            (el) => el.getClientRects().length > 0,
          ).length === 2
        );
      }),
      null,
      { timeout: 15_000 },
    );

    const field = page.locator(COLOR_INPUT).first();
    const before = await page.evaluate(
      () => document.querySelector<HTMLInputElement>("input.mantine-ColorInput-input")?.value ?? "",
    );
    await field.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("#");
    await page.keyboard.press("3");
    await page.keyboard.press("3");
    await page.keyboard.press("6");
    await page.keyboard.press("6");
    await page.keyboard.press("c");
    await page.keyboard.press("c");
    await page.waitForFunction(
      assertSerializable(() => {
        const el = document.querySelector<HTMLInputElement>("input.mantine-ColorInput-input");
        return el?.value.toLowerCase() === "#3366cc";
      }),
      null,
      { timeout: 10_000 },
    );
    const after = await page.evaluate(
      () => document.querySelector<HTMLInputElement>("input.mantine-ColorInput-input")?.value ?? "",
    );

    // Leaving tears the tool down; the cycle must end where it started.
    await page.goto("/editor", { waitUntil: "domcontentloaded" });
    return `settings opened, colour field went ${before} → ${after}, tool closed`;
  },
};
