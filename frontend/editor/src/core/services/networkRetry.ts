import axios from "axios";
import apiClient from "@app/services/apiClient";

// Follow whatever HTTP client this build resolves @app/services/apiClient to
// (axios on web, the Tauri client on desktop) so the helper is build-agnostic.
// The response type is left to inference from the apiClient.post call itself —
// ReturnType<> can't recover it because axios's post generics stay uninstantiated.
type PostConfig = NonNullable<Parameters<typeof apiClient.post>[2]>;

// Bounded auto-retry for tool operation requests that fail with no HTTP status
// (the request never got a response — backend slow, still booting, or briefly
// down). We retry transparently a few times before letting the failure surface
// to the user, so a momentary blip no longer becomes a dead-end "Network error".
const MAX_ATTEMPTS = 3; // 1 initial attempt + 2 retries
const BASE_RETRY_DELAY_MS = 800;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * A no-status network failure: an axios error with no response at all. HTTP
 * errors (4xx/5xx) carry a response and a meaningful body, so retrying them is
 * pointless (422) or the server's job to fix (5xx) — only genuine
 * never-got-a-response failures are retried here.
 */
function isNoStatusNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response && !axios.isCancel(error);
}

/**
 * POST with a bounded auto-retry on no-status network failures. Intermediate
 * attempts suppress the global error toast/capture (via suppressErrorToast) so
 * only the final failure surfaces to the user and error tracking.
 */
export async function postWithNetworkRetry(
  url: string,
  data: unknown,
  config: PostConfig = {},
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isFinalAttempt = attempt === MAX_ATTEMPTS;
    try {
      return await apiClient.post(url, data, {
        ...config,
        ...(isFinalAttempt ? {} : { suppressErrorToast: true }),
      });
    } catch (error) {
      lastError = error;
      if (isFinalAttempt || !isNoStatusNetworkError(error)) {
        throw error;
      }
      await wait(BASE_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError;
}
