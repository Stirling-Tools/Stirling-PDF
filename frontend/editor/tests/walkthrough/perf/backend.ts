/**
 * Whether the route under test can render at all.
 *
 * The app blocks its first paint on `app-config`: with nothing behind the dev
 * server it paints an error state, and every number collected afterwards
 * describes that screen rather than the feature. Both the interaction and the
 * Lighthouse audit ask this question first and record the answer, so a
 * measurement taken without a backend is reported as such instead of being
 * quietly trusted.
 */

export const CONFIG_PATH = "/api/v1/config/app-config";

export interface BackendState {
  /** True when the route's own data endpoint answered successfully. */
  ok: boolean;
  endpoint: string;
  /** Human outcome, e.g. "answered 200" or "did not answer (timeout)". */
  detail: string;
}

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
      endpoint: `${baseUrl}${path}`,
      detail: `not a usable address (${(error as Error).message})`,
    };
  }
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: response.ok, endpoint, detail: `answered ${response.status}` };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      detail: `did not answer (${(error as Error).message})`,
    };
  }
}

/** The caveat an audit or a measurement carries while the app is erroring. */
export function errorStateNote(state: BackendState): string {
  return (
    `${state.endpoint} ${state.detail}: the page renders its error state, so ` +
    `these numbers describe that state and not the feature. Serve the audited ` +
    `route with a backend (or a build that does not need one) before trusting them.`
  );
}
