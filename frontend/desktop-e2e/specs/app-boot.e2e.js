// Proves the packaged app actually opens and renders. A `tauri build` that
// succeeds still ships a blank window when the webview fails to start (#6878
// Wayland/EGL) or when the frontend bundle never mounts - neither shows up in
// a build-only CI job.

import { waitForAppMount } from "./helpers/ui.js";

describe("desktop app boot", () => {
  it("opens the app window with the bundled frontend title", async () => {
    await expect(browser).toHaveTitle("Stirling PDF");
  });

  it("mounts the React app instead of showing a blank window", async () => {
    const root = await $("#root");
    await expect(root).toExist();

    // A blank window still has #root - the tell is that nothing rendered into
    // it. Wait for real children rather than asserting immediately, since the
    // webview is driveable before React has finished its first paint.
    await waitForAppMount();
  });

  it("stays on an app URL so the navigation guard has not been bypassed", async () => {
    // lib.rs::is_app_url only permits the bundled app and the dev server.
    // Anything else here means the webview navigated away from the app, which
    // is what left the window unclosable in #6872.
    const url = await browser.getUrl();
    expect(url).toMatch(
      /^(tauri:\/\/localhost|https?:\/\/(tauri\.localhost|localhost|127\.0\.0\.1))/,
    );
  });
});
