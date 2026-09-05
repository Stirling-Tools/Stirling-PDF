// Proves the bundled JRE can actually run the bundled JAR.
//
// This is the regression net for the whole jlink chain: a runtime missing a
// module (jdk.dynalink was missing and broke PDF/A validation), a JRE older
// than the JAR's class-file version, a JAR that never got copied into
// resources, or natives absent for the platform. All of those bundle
// perfectly happily and only fail when the app is run.

import { readAppLogs, waitForBackendPort } from "./helpers/tauri.js";

describe("bundled backend sidecar", () => {
  let port;

  it("starts the bundled JRE and reports the backend port", async () => {
    try {
      port = await waitForBackendPort();
    } catch (error) {
      // The Rust side logs every step of JRE/JAR discovery, so dump it before
      // failing - otherwise a CI failure here is undebuggable.
      const logs = await readAppLogs();
      console.error("--- app logs ---");
      console.error(logs.join("\n") || "(no logs captured)");
      console.error("--- end app logs ---");
      throw error;
    }

    expect(port).toBeGreaterThan(0);
  });

  it("serves a healthy status endpoint from the bundled JAR", async () => {
    // Checked from Node rather than the webview: the backend's CORS policy is
    // written for the app's tauri:// origin, and the desktop app itself goes
    // through tauri-plugin-http, so a raw in-page fetch is not representative.
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/info/status`);
    expect(response.status).toBe(200);

    const body = await response.text();
    expect(body).toContain("UP");
  });
});
