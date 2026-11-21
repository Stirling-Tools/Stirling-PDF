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

/** The onboarding shell's header control: the only exit from its slides. */
const ONBOARDING_CONTROL = '[data-testid="onboarding-header-control"]';

/**
 * Everything that ends a modal, looked up inside that modal. `[aria-label]`
 * values are translated, so the two hooks a locale cannot move lead.
 */
const MODAL_DISMISS_CONTROLS = [
  ONBOARDING_CONTROL,
  ".mantine-Modal-close",
  '[aria-label="Close"]',
].join(", ");

/**
 * Counts the overlays that are actually painted.
 *
 * A modal kept in the DOM by `keepMounted` leaves a hidden overlay behind, and
 * counting that reads as a UI no amount of dismissing can unblock.
 */
function countOverlays() {
  return browser.execute(
    () =>
      [...document.querySelectorAll(".mantine-Modal-overlay")].filter(
        (overlay) => overlay.getClientRects().length > 0,
      ).length,
  );
}

/**
 * Reads the dialog in front: its accessible name, its text, and the names of
 * the controls on it. Null when no dialog is on screen.
 */
function readTopModal() {
  return browser.execute(() => {
    const dialogs = [
      ...document.querySelectorAll(".mantine-Modal-content"),
    ].filter((dialog) => dialog.getClientRects().length > 0);
    // Stacked modals portal in render order, so the last one is the front.
    const top = dialogs[dialogs.length - 1];
    if (!top) return null;

    const name = (control) =>
      control.getAttribute("data-testid") ||
      control.getAttribute("aria-label") ||
      (control.textContent || "").replace(/\s+/g, " ").trim() ||
      "unnamed";

    return {
      label: top.getAttribute("aria-label") || "dialog",
      text: (top.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      controls: [...top.querySelectorAll("button, [role=button]")].map(name),
    };
  });
}

/**
 * One line naming the dialog. Includes its text because a flow reuses the same
 * dialog for every slide, so the text is the only thing that says which slide
 * is on screen - and therefore the only way to tell "it advanced" from
 * "nothing happened".
 */
function describe(modal) {
  if (!modal) return "no dialog";
  return `The "${modal.label}" dialog ("${modal.text}")`;
}

/**
 * Walks the flow a fresh profile opens with: the welcome slide, the sign-in
 * slide behind it, and whatever the app offers after those.
 *
 * Escape is not a way out. Both onboarding slides render `closeOnEscape={false}`
 * and a forward control in place of a close button, so the only thing that ends
 * a slide is that control - which is why this drives the flow rather than
 * pressing Escape at it and hoping.
 *
 * The `?bypassOnboarding=true` route is deliberately not used - it also
 * suppresses the sign-in modal, and dismissing what a real first-run user sees
 * is closer to the thing we want to know still works.
 */
export async function dismissStartupModals(timeout = 60_000) {
  const deadline = Date.now() + timeout;

  // The card only mounts once the app knows whether anyone is signed in, so
  // waiting for it here is what stops it arriving mid-spec instead.
  if ((await countOverlays()) === 0) {
    await $(`.mantine-Modal-content ${ONBOARDING_CONTROL}`)
      .waitForDisplayed({ timeout: 15_000 })
      .catch(() => {});
  }

  while ((await countOverlays()) > 0) {
    const modal = await readTopModal();
    // An overlay with nothing behind it is one mid-fade; let it finish rather
    // than pressing Escape into the app underneath.
    if (!modal) {
      await browser.waitUntil(async () => (await countOverlays()) === 0, {
        timeout: 5_000,
        interval: 250,
        timeoutMsg: "An overlay stayed up with no dialog behind it.",
      });
      break;
    }

    const blocking = describe(modal);
    if (Date.now() > deadline) {
      throw new Error(
        `Startup modals kept arriving for ${timeout}ms. ${blocking} is still up.`,
      );
    }

    const covered = await closeTopModal();
    try {
      // Each dismissal either advances the flow or ends it, so wait for the
      // screen to change rather than pausing a fixed beat and guessing.
      await browser.waitUntil(
        async () =>
          (await countOverlays()) === 0 ||
          describe(await readTopModal()) !== blocking,
        { timeout: 10_000, interval: 250 },
      );
    } catch {
      throw new Error(
        `${blocking} did not respond to its own dismiss control` +
          `${covered ? `, which is covered by ${covered}` : ""}. ` +
          `Controls on it: ${modal.controls.join(", ") || "none"}.`,
      );
    }
  }

  // Declining sign-in drops the app into local mode, which remounts the
  // providers and briefly empties #root.
  await waitForAppMount();
}

/** The modal in front, or null. Stacked modals portal in render order. */
async function topModalElement() {
  const contents = await $$(".mantine-Modal-content");
  for (let i = contents.length - 1; i >= 0; i -= 1) {
    if (await contents[i].isDisplayed()) return contents[i];
  }
  return null;
}

/**
 * Ends the modal in front. Returns what stopped its control being clicked, or
 * null when nothing did.
 *
 * Scoped to that one modal: a buried modal's control still matches the selector,
 * and clicking it raises "element click intercepted", ends nothing, and hides
 * whatever the real blocker was. The sign-in modal in particular draws no
 * control at all, so a search across the whole page would press the card behind
 * it and report that as unresponsive.
 */
async function closeTopModal() {
  let blocked = null;
  const top = await topModalElement();

  for (const control of top ? await top.$$(MODAL_DISMISS_CONTROLS) : []) {
    try {
      if (!(await control.isDisplayed())) continue;

      const obstruction = await obstructionOf(control);
      if (obstruction) {
        blocked ??= obstruction;
        continue;
      }
      await control.click();
      return null;
    } catch (error) {
      if (!/intercepted|stale element/i.test(String(error))) throw error;
      blocked ??= "an element that moved or was replaced mid-click";
    }
  }

  // No control to press: a modal that draws none still closes on Escape, unless
  // it opted out - and then the caller's next poll reports it by name.
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
    // The text is what identifies which toast or panel it was, and that is the
    // part a CI failure needs.
    const text = (hit.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    return `<${hit.tagName.toLowerCase()}${id}${classes}>${text ? ` "${text}"` : ""}`;
  }, element);
}

/**
 * Closes every toast on screen.
 *
 * The toast container is fixed over the right-hand tool list, so a toast that
 * does not auto-dismiss sits on top of the tool buttons for the rest of the
 * run and WebKitWebDriver refuses to click through it. The dismiss control is
 * the last button in each toast's controls row.
 */
async function dismissToasts() {
  for (const button of await $$(".toast-controls .toast-button:last-child")) {
    await button.click().catch(() => {});
  }
}

/**
 * Clicks the first match the webview will actually accept a click on.
 *
 * Three things defeat a plain `$(selector).click()` in the packaged app: the
 * same `data-tour` id is rendered by three different tool-list components, so
 * the first match in DOM order need not be the one on screen; a toast sits over
 * the tool list until something dismisses it; and a modal can arrive late, the
 * sign-in one landing once its network call settles. Each of them makes
 * WebKitWebDriver refuse the click outright. So: try every visible match, clear
 * whatever is on top between rounds, and name what swallowed the click if the
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
    await dismissToasts();
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
  // Declining sign-in remounts the providers, and unhiding an input that is not
  // back yet is a silent no-op that resurfaces as "element not interactable".
  await $('[data-testid="file-input"]').waitForExist({
    timeout: 30_000,
    timeoutMsg: "The app never rendered its file input.",
  });

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
