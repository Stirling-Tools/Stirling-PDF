/**
 * Demo-data seam: while enabled, apiClient answers from the portal's MSW
 * fixture handlers instead of the network. There is no service worker and no
 * request interception — only fetches made through @portal/api/http see
 * fixture data, and only while the flag is on. msw and the handlers/fixtures
 * chunk are loaded on first enable, so ordinary sessions never pay for them.
 *
 * Built for the portal onboarding tour: enable on tour start so every view the
 * tour visits renders populated, disable on finish/skip — views refetch real
 * data when they next mount.
 */
import type { HttpRequestOptions } from "@portal/api/http";

type DemoResolver = (request: Request) => Promise<Response | undefined>;

let resolver: DemoResolver | null = null;
let active = false;

/** Turn demo data on. Safe to call repeatedly; loads msw + fixtures once. */
export async function enablePortalDemoData(): Promise<void> {
  if (!resolver) {
    const [{ getResponse }, { handlers }] = await Promise.all([
      import("msw"),
      import("@portal/mocks/handlers"),
    ]);
    resolver = (request) => getResponse(handlers, request);
  }
  active = true;
}

/** Turn demo data off. Views pick up real data on their next fetch. */
export function disablePortalDemoData(): void {
  active = false;
}

export function isPortalDemoDataActive(): boolean {
  return active;
}

/**
 * Fixture response for the request while demo data is on; undefined when demo
 * data is off or no handler matches (callers then hit the real network).
 */
export async function resolveDemoResponse(
  url: URL,
  options: HttpRequestOptions,
): Promise<Response | undefined> {
  if (!active || !resolver) return undefined;
  const request = new Request(url, {
    method: options.method ?? "GET",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  return resolver(request);
}
