import { readMocksPreference } from "@portal/mocks/preference";

/**
 * Start the portal's MSW worker if the mocks preference is on. Await this before
 * rendering PortalApp so the worker is registered before the first data fetch.
 * The dynamic import keeps MSW and its fixtures out of chunks that don't run it.
 */
export async function startPortalMocksIfEnabled(): Promise<void> {
  if (!readMocksPreference()) return;
  const { startMockWorker } = await import("@portal/mocks/browser");
  await startMockWorker();
}
