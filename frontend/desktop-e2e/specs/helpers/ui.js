// `browser`, `$` and `expect` are injected as globals by WebdriverIO's jasmine
// framework (injectGlobals defaults to true), so specs and helpers use them
// without importing.

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
  for (let attempt = 0; attempt < maxModals; attempt += 1) {
    if ((await countOverlays()) === 0) return;

    const close = await $('.mantine-Modal-content [aria-label="Close"]');
    if (await close.isExisting()) {
      await close.click().catch(() => {});
    } else {
      await browser.keys(["Escape"]);
    }
    await browser.pause(1_000);
  }

  await browser.waitUntil(async () => (await countOverlays()) === 0, {
    timeout: 15_000,
    interval: 500,
    timeoutMsg: `A modal overlay is still blocking the UI after ${maxModals} dismissals.`,
  });
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
