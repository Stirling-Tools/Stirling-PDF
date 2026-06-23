import { setupWorker } from "msw/browser";
import { JWT_STORAGE_KEY } from "@shared/auth";
import { handlers } from "@portal/mocks/handlers";
import { MOCK_TOKEN } from "@portal/mocks/auth";

export const worker = setupWorker(...handlers);

let workerStarted = false;

/**
 * Seed the shared auth token so the auth gate resolves to the mock admin in
 * design-prototype mode (no backend needed). Only ever runs when mocks are on;
 * real deployments leave the token untouched and authenticate for real.
 */
function seedMockAuthToken(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(JWT_STORAGE_KEY, MOCK_TOKEN);
    }
  } catch {
    // localStorage unavailable - the gate will simply show the login screen.
  }
}

/**
 * Start the MSW worker. Idempotent — calling repeatedly is safe.
 *
 * The toggle flips MSW by writing the preference to localStorage and
 * reloading the page, so there's no need for a `stopMockWorker` counterpart:
 * the next boot just decides whether to call this or not.
 */
export async function startMockWorker(): Promise<void> {
  if (workerStarted) return;
  seedMockAuthToken();
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
    quiet: true,
  });
  workerStarted = true;
}
