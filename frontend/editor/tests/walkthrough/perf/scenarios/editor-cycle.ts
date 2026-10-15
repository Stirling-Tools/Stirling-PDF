/**
 * Built-in interaction scenarios: one open/use/close cycle each, driven the
 * way a person drives the app. The collector repeats `use` N times inside one
 * measured window, so a cycle must return the app to its starting state.
 *
 * Every wait here is a condition on the app (`waitForSelector`,
 * `waitForFunction`); nothing waits for a clock to pass, so a cycle that never
 * converges fails loudly instead of measuring a sleep.
 *
 * Page functions go through `assertSerializable`: a `function` declared inside
 * one compiles to a bundler helper call that dies in the browser, and the
 * failure otherwise reaches you as a metric of zero.
 */

// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import { assertSerializable } from "../serialize";
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import type { Scenario, ScenarioPage } from "../types";

const EDITOR_ROUTE = "/editor";
const SETTINGS_SURFACE = ".settings-page";
const PICKER_SCROLLER = ".tool-picker-scrollable";

/** Leaves Settings with browser Back; section changes replace history entries. */
async function closeSettings(page: ScenarioPage): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const visible = await page
      .locator(SETTINGS_SURFACE)
      .first()
      .isVisible()
      .catch(() => false);
    if (!visible) return;
    await page.goBack({ timeout: 2_000 }).catch(() => undefined);
    await page
      .waitForSelector(SETTINGS_SURFACE, { state: "hidden", timeout: 3_000 })
      .catch(() => undefined);
  }
}

/**
 * Opens Settings, switches to another section, and closes it again. Settings
 * is a route with a nav list, so this exercises route commit, nav rendering and
 * a section's form surface — a realistic "open a panel, use it, leave" cycle.
 */
export const editorSettingsCycle: Scenario = {
  id: "editor-settings-cycle",
  name: "Editor · open Settings, switch section, close",
  platform: "desktop-web",
  fixture: "editor, stubbed API, no document loaded",
  route: EDITOR_ROUTE,
  async use(page: ScenarioPage): Promise<string> {
    await page.locator('[data-testid="config-button"]').first().click({
      timeout: 15_000,
    });
    await page.waitForSelector(SETTINGS_SURFACE, {
      state: "visible",
      timeout: 10_000,
    });
    await page.waitForSelector(`${SETTINGS_SURFACE} .modal-nav-item`, {
      state: "visible",
      timeout: 10_000,
    });

    // Only a section that is neither current nor locked: an admin row is
    // `aria-disabled` under the stubbed API, and clicking it measures nothing.
    const available = `${SETTINGS_SURFACE} .modal-nav-item:not(.active):not([aria-disabled="true"])`;
    await page.waitForSelector(available, {
      state: "visible",
      timeout: 10_000,
    });
    await page.locator(available).first().click({ timeout: 10_000 });
    // The address bar flips before React commits the section, so wait for the
    // commit itself: the clicked row becomes active and the title renders.
    await page.waitForFunction(
      assertSerializable(() => {
        const active = document.querySelector(
          ".settings-page .modal-nav-item.active",
        );
        const title = document.querySelector(".settings-page__title");
        return Boolean(
          active && title && (title.textContent ?? "").trim().length > 0,
        );
      }),
      null,
      { timeout: 10_000 },
    );

    await closeSettings(page);
    return "opened Settings, switched section, closed it";
  },
};

/**
 * Scrolls the tool picker to the last tool and back. The picker mounts tiles as
 * they approach its viewport, so a full traversal forces the mounting and
 * layout work a real user triggers when browsing for a tool.
 */
export const editorPickerScroll: Scenario = {
  id: "editor-picker-scroll",
  name: "Editor · browse the tool picker end to end",
  platform: "desktop-web",
  fixture: "editor, stubbed API, no document loaded",
  route: EDITOR_ROUTE,
  async use(page: ScenarioPage): Promise<string> {
    await page.waitForSelector(PICKER_SCROLLER, {
      state: "visible",
      timeout: 15_000,
    });
    await page.waitForFunction(
      assertSerializable(() => {
        const scroller = document.querySelector<HTMLElement>(
          ".tool-picker-scrollable",
        );
        return Boolean(
          scroller && scroller.scrollHeight > scroller.clientHeight,
        );
      }),
      null,
      { timeout: 15_000 },
    );
    // Each poll advances one viewport and reports whether the end is reached,
    // which keeps the traversal paced by the app rather than by a timer.
    await page.waitForFunction(
      assertSerializable(() => {
        const scroller = document.querySelector<HTMLElement>(
          ".tool-picker-scrollable",
        );
        if (!scroller) return false;
        const atEnd =
          scroller.scrollTop >=
          scroller.scrollHeight - scroller.clientHeight - 4;
        if (!atEnd)
          scroller.scrollTop = Math.min(
            scroller.scrollTop + scroller.clientHeight,
            scroller.scrollHeight,
          );
        return atEnd;
      }),
      null,
      { timeout: 20_000 },
    );
    await page.waitForFunction(
      assertSerializable(() => {
        const scroller = document.querySelector<HTMLElement>(
          ".tool-picker-scrollable",
        );
        if (!scroller) return false;
        const atTop = scroller.scrollTop <= 4;
        if (!atTop) scroller.scrollTop = 0;
        return atTop;
      }),
      null,
      { timeout: 20_000 },
    );
    return "scrolled the tool picker to its last tile and back";
  },
};

export const BUILTIN_SCENARIOS: Scenario[] = [
  editorSettingsCycle,
  editorPickerScroll,
];
