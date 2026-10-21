/**
 * Whether the page under measurement can render at all.
 *
 * The app blocks its first paint on `app-config`: with nothing behind the dev
 * server it paints an error state, and every number collected afterwards
 * describes that screen rather than the feature. The interaction run answers
 * that call with Playwright route stubs; a Lighthouse audit drives its own
 * Chrome and gets the same table from `stub-backend.ts` or a live backend. This
 * module records which of those answered, so a measurement of an error state is
 * never reported as a measurement of the feature.
 */

export const CONFIG_PATH = "/api/v1/config/app-config";

/** What answered the measured page's API calls. */
export type BackendSource = "live" | "stubbed" | "unavailable";

export interface BackendState {
  /** True when the route's own data endpoint answered successfully. */
  ok: boolean;
  source: BackendSource;
  endpoint: string;
  /** Human outcome, e.g. "answered 200" or "did not answer (timeout)". */
  detail: string;
}

/** Probes the dev server the way the measured page would. */
export async function probeBackend(
  baseUrl: string,
  path: string = CONFIG_PATH,
  timeoutMs = 5_000,
): Promise<BackendState> {
  let endpoint: string;
  try {
    endpoint = new URL(path, baseUrl).toString();
  } catch (error) {
    return {
      ok: false,
      source: "unavailable",
      endpoint: `${baseUrl}${path}`,
      detail: `not a usable address (${(error as Error).message})`,
    };
  }
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      ok: response.ok,
      source: response.ok ? "live" : "unavailable",
      endpoint,
      detail: `answered ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      source: "unavailable",
      endpoint,
      detail: `did not answer (${(error as Error).message})`,
    };
  }
}

/** The state of a page whose API calls the repo's stubs answer. */
export function stubbedState(
  endpoint: string,
  detail = "answered by the repo's API stubs",
): BackendState {
  return {
    ok: true,
    source: "stubbed",
    endpoint,
    detail,
  };
}

/** The caveat an audit carries while the app is erroring. */
export function errorStateNote(state: BackendState): string {
  return (
    `${state.endpoint} ${state.detail}: the page renders its error state, so ` +
    `these numbers describe that state and not the feature. Serve the audited ` +
    `route with a backend (or a build that does not need one) before trusting them.`
  );
}

/** What the backend state adds to a run's recorded limitations. */
export function backendLimitations(state: BackendState): string[] {
  if (state.source === "stubbed") {
    return [
      `the page's API calls were answered by the repo's API stubs (${state.endpoint}), not a live backend, so these numbers describe the UI with synthetic data`,
    ];
  }
  if (state.source === "unavailable") {
    return [errorStateNote(state)];
  }
  return [];
}
