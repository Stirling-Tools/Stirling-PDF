import { setupWorker } from "msw/browser";
import { handlers } from "@app/mocks/handlers";

export const worker = setupWorker(...handlers);

let workerStarted = false;

/**
 * Start the MSW worker. Idempotent — calling repeatedly is safe.
 *
 * The toggle flips MSW by writing the preference to localStorage and
 * reloading the page, so there's no need for a `stopMockWorker` counterpart:
 * the next boot just decides whether to call this or not.
 */
export async function startMockWorker(): Promise<void> {
  if (workerStarted) return;
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
    quiet: true,
  });
  workerStarted = true;
}
