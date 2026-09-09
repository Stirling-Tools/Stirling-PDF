// `browser`, `$`, `$$` and `expect` are injected as globals by WebdriverIO's
// jasmine framework (injectGlobals defaults to true), so specs and helpers use
// them without importing.

/** Resolves once React has rendered something into #root. */
export async function waitForAppMount(timeout = 60_000) {
  await browser.waitUntil(
    async () =>
      (await browser.execute(
        () => document.querySelectorAll("#root *").length,
      )) > 0,
    {
      timeout,
      interval: 500,
      timeoutMsg:
        "#root never received any children - the app window opened but the " +
        "frontend bundle did not mount (blank-window regression).",
    },
  );
}

function countOverlays() {
  return browser.execute(
    () => document.querySelectorAll(".mantine-Modal-overlay").length,
  );
}

/**
 * A fresh profile greets you with the "Welcome to Stirling V2" modal and then
 * the sign-in modal, each behind an overlay that swallows clicks. Close them in
 * a loop rather than assuming a fixed number: the chain is version-dependent,
 * and a spec that hard-codes two dismissals breaks the moment a third appears.
 *
 * The `?bypassOnboarding=true` route is deliberately not used - it also
 * suppresses the sign-in modal, and dismissing what a real first-run user sees
 * is closer to the thing we want to know still works.
 */
export async function dismissStartupModals(maxModals = 6) {
  let blocked = null;
  let overlays = await countOverlays();

  for (let attempt = 0; attempt < maxModals && overlays > 0; attempt += 1) {
    blocked = await closeTopModal();
    await browser.pause(1_000);

    const remaining = await countOverlays();
    // Clicking achieved nothing, so stop pressing the same button: Escape is
    // the only other way out of a Mantine modal.
    if (remaining >= overlays) await browser.keys(["Escape"]);
    overlays = remaining;
  }

  if (overlays === 0) return;

  try {
    await browser.waitUntil(async () => (await countOverlays()) === 0, {
      timeout: 15_000,
      interval: 500,
    });
  } catch {
    throw new Error(
      `A modal overlay is still blocking the UI after ${maxModals} dismissals` +
        `${blocked ? ` - its close button is covered by ${blocked}` : ""}.`,
    );
  }
}

/**
 * Dismisses the frontmost modal. Returns what stopped its close button being
 * clicked, or null when nothing did.
 *
 * A close button is only clicked when it is on screen and nothing sits over it.
 * Existence is not enough: a buried modal's button still matches the selector,
 * and clicking it raises "element click intercepted", closes nothing, and hides
 * the Escape path that both desktop startup modals actually rely on - they
 * render `withCloseButton={false}` and close on Escape.
 */
async function closeTopModal() {
  let blocked = null;
  const closers = await $$('.mantine-Modal-content [aria-label="Close"]');

  // Stacked modals portal in render order, so the last button belongs to the
  // modal in front; the ones before it are under its full-viewport wrapper.
  for (let i = closers.length - 1; i >= 0; i -= 1) {
    const close = closers[i];
    try {
      if (!(await close.isDisplayed())) continue;

      const obstruction = await obstructionOf(close);
      if (obstruction) {
        blocked ??= obstruction;
        continue;
      }
      await close.click();
      return null;
    } catch (error) {
      if (!/intercepted|stale element/i.test(String(error))) throw error;
      blocked ??= "an element that moved or was replaced mid-click";
    }
  }

  await browser.keys(["Escape"]);
  return blocked;
}

/**
 * Names whatever owns the element's in-view centre point, or null when the
 * element itself does. This is the check WebDriver runs before a click, so it
 * both predicts "element click intercepted" and identifies the culprit.
 */
function obstructionOf(element) {
  return browser.execute((target) => {
    const rect = target.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    if (!hit) return "nothing (its centre point is outside the viewport)";
    if (hit === target || target.contains(hit)) return null;
    const id = hit.id ? `#${hit.id}` : "";
    const classes = String(hit.className || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((name) => `.${name}`)
      .join("");
    return `<${hit.tagName.toLowerCase()}${id}${classes}>`;
  }, element);
}

/**
 * Clicks the first match the webview will actually accept a click on.
 *
 * Two things defeat a plain `$(selector).click()` in the packaged app. The same
 * `data-tour` id is rendered by three different tool-list components, so the
 * first match in DOM order is not necessarily the one on screen. And the app
 * keeps producing late overlays - the sign-in modal lands once its network call
 * settles, well after the first-run modals were dismissed - which makes
 * WebKitWebDriver reject the click outright. So: try every visible match,
 * clear overlays between rounds, and name what swallowed the click if the
 * element never takes one.
 */
export async function clickFirstClickable(
  selector,
  description,
  timeout = 30_000,
) {
  await $(selector).waitForExist({
    timeout,
    timeoutMsg: `${description} never appeared.`,
  });

  let blocker = null;
  const tryOnce = async () => {
    blocker = null;
    for (const candidate of await $$(selector)) {
      try {
        if (!(await candidate.isDisplayed())) continue;
        await candidate.scrollIntoView({ block: "center", inline: "center" });

        const obstruction = await obstructionOf(candidate);
        if (obstruction) {
          blocker ??= obstruction;
          continue;
        }
        await candidate.click();
        return true;
      } catch (error) {
        // A re-render between the query and the click is a reason to go round
        // again, not to fail the spec; anything else is a real fault.
        if (!/intercepted|stale element/i.test(String(error))) throw error;
        blocker ??= "an element that moved or was replaced mid-click";
      }
    }
    // Only when a modal is actually up: closeTopModal falls back to Escape, and
    // a stray Escape with no modal open would close the tool panel instead.
    if ((await countOverlays()) > 0) await closeTopModal();
    return false;
  };

  try {
    await browser.waitUntil(tryOnce, { timeout, interval: 500 });
  } catch {
    throw new Error(
      `${description} never took a click - ` +
        `${blocker ?? "no visible match was found"} was in the way.`,
    );
  }
}

/**
 * Puts a file into the workbench through the app's own file input.
 *
 * The input is visually hidden, and unlike Playwright's setInputFiles a
 * WebDriver send-keys needs the element to be interactable - WebKitWebDriver
 * refuses outright. Making it briefly visible is the standard workaround and
 * still exercises the real upload path.
 */
export async function uploadFile(path) {
  await browser.execute(() => {
    const input = document.querySelector('[data-testid="file-input"]');
    if (!input) return;
    input.style.display = "block";
    input.style.visibility = "visible";
    input.style.opacity = "1";
    input.style.width = "1px";
    input.style.height = "1px";
  });

  await $('[data-testid="file-input"]').addValue(path);

  // The sidebar list only renders once addFiles has resolved, which awaits the
  // IndexedDB write - so this doubles as proof that desktop file persistence
  // works in the packaged webview.
  await $(".file-sidebar-file-item").waitForExist({
    timeout: 30_000,
    timeoutMsg: `${path} never appeared in the file sidebar.`,
  });
}
