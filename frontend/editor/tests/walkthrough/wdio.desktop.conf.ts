/**
 * WebdriverIO configuration for Tauri desktop captures (embedded provider).
 *
 * The service spawns the binary the adapter resolves and hosts the W3C
 * server inside the app — no external `tauri-driver` needed. Override the
 * binary explicitly with `TAURI_APP_BINARY`; otherwise the adapter searches
 * the real Cargo target directories and fails the run when nothing built
 * is found.
 */
// oxlint-disable-next-line no-restricted-imports -- harness runs in node, outside the app aliases
import {
  ensureNoRunningInstance,
  resolveTauriBinary,
} from "./adapters/tauri-desktop";

const appBinaryPath = resolveTauriBinary();

// Untyped on purpose: the service reads the vendor `tauri:options` key at
// runtime, but it is not part of the public capability types, so annotating
// `WebdriverIO.Config` rejects the documented shape.
export const config = {
  runner: "local",
  framework: "mocha",
  reporters: ["spec"],
  specs: ["./scenarios/*.desktop.scenario.ts"],
  maxInstances: 1,
  logLevel: "info",
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 2,
  mochaOpts: { ui: "bdd", timeout: 180_000 },
  // The embedded service spawns the app when the session starts, so the
  // already-running check must run here in the launcher — inside a scenario
  // it would find the test's own app process and abort every run.
  onPrepare: () => {
    ensureNoRunningInstance();
  },
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        embeddedPort: 4445,
        startTimeout: 60_000,
        captureBackendLogs: true,
        captureFrontendLogs: true,
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application: appBinaryPath },
    },
  ],
};
