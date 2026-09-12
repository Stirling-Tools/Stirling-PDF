// `browser`, `$` and `expect` are injected as globals by WebdriverIO's mocha
// framework (injectGlobals defaults to true), so specs and helpers use them
// without importing.

/**
 * Fires a Tauri command in the webview and returns the most recent answer.
 *
 * Fire-and-stash rather than awaiting inside the browser: that keeps us on
 * synchronous `browser.execute`, whose behaviour is stable across WebdriverIO
 * majors (the `executeAsync` callback form is deprecated), and it re-seeds
 * itself if the webview ever reloads and wipes the stash.
 *
 * @returns {Promise<{value?: unknown, error: string|null}>} `value` is absent
 * until the first call resolves.
 */
export function invokeLatest(command, key = command) {
  return browser.execute(
    (cmd, stashKey) => {
      const stash = (window.__stirlingE2E = window.__stirlingE2E || {});
      const slot = (stash[stashKey] = stash[stashKey] || { error: null });
      window.__TAURI_INTERNALS__
        .invoke(cmd)
        .then((value) => {
          slot.value = value;
        })
        .catch((error) => {
          slot.error = String(error);
        });
      return { value: slot.value, error: slot.error };
    },
    command,
    key,
  );
}

/**
 * Waits for the bundled JRE to boot the Stirling JAR and resolves to the port
 * the backend picked. The app asks the OS for a free port (-Dserver.port=0),
 * so the port is only knowable at runtime via the `get_backend_port` command.
 */
export async function waitForBackendPort(timeout = 210_000) {
  let port = null;

  await browser.waitUntil(
    async () => {
      const { value, error } = await invokeLatest("get_backend_port");
      if (error) {
        throw new Error(`get_backend_port rejected: ${error}`);
      }
      if (typeof value === "number") {
        port = value;
        return true;
      }
      return false;
    },
    {
      timeout,
      interval: 2_000,
      timeoutMsg:
        `Backend never reported a port within ${timeout}ms. The bundled JRE ` +
        "either failed to launch or crashed before Spring Boot bound a port - " +
        "check the app logs dumped by the spec.",
    },
  );

  return port;
}

/** Reads the in-app log buffer, which records the whole backend startup path. */
export async function readAppLogs() {
  const { value } = await invokeLatest("get_tauri_logs", "logs");
  if (Array.isArray(value)) return value;
  // First call only fires the request; give it a beat, then read the result.
  await browser.pause(1_000);
  const { value: retried } = await invokeLatest("get_tauri_logs", "logs");
  return Array.isArray(retried) ? retried : [];
}
