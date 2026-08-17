import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createPortalQueryClient } from "@portal/queryClient";
import { usePoliciesOverview } from "@portal/queries/policies";
import { useProcessorFlow } from "@portal/queries/processorFlow";

/**
 * Proves the two sharing properties the migration is for, at the hook level:
 *   - in-view: several consumers on one screen (Home renders the policies
 *     overview AND the processor flow, which both need /policies + /runs)
 *     trigger ONE fetch of each endpoint, not one per consumer.
 *   - cross-view: navigating to another screen that needs the same data
 *     (unmount + remount within staleTime) serves it from cache — no refetch.
 */

// Keep apiClient.local's transport hermetic (no real token / Supabase at import).
vi.mock("@app/auth", () => ({
  getStoredToken: () => null,
  clearStoredToken: vi.fn(),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => null,
  configureSupabase: vi.fn(),
}));

const counts: Record<string, number> = {};
const server = setupServer(
  http.get("*/api/v1/policies", () => {
    counts["/policies"] = (counts["/policies"] ?? 0) + 1;
    return HttpResponse.json([]);
  }),
  http.get("*/api/v1/policies/runs", () => {
    counts["/policies/runs"] = (counts["/policies/runs"] ?? 0) + 1;
    return HttpResponse.json([]);
  }),
  http.get("*/api/v1/sources", () => {
    counts["/sources"] = (counts["/sources"] ?? 0) + 1;
    return HttpResponse.json({ sources: [] });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  for (const k of Object.keys(counts)) delete counts[k];
});

// Two Home consumers of the same base queries, rendered together.
function HomeConsumers() {
  usePoliciesOverview(); // e.g. onboarding progress
  useProcessorFlow(); // the processor visualiser (also needs /sources)
  return null;
}
// A Policies-view-style consumer of the same policies caches.
function PoliciesConsumer() {
  usePoliciesOverview();
  return null;
}

describe("portal query sharing", () => {
  it("in-view: multiple consumers of the same endpoints fetch each once", async () => {
    const client = createPortalQueryClient();
    render(
      <QueryClientProvider client={client}>
        <HomeConsumers />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(counts["/policies"]).toBe(1));
    // Two consumers both needed /policies + /runs; /sources came from the flow.
    expect(counts["/policies"]).toBe(1);
    expect(counts["/policies/runs"]).toBe(1);
    expect(counts["/sources"]).toBe(1);
  });

  it("cross-view: a later screen reusing the data refetches nothing", async () => {
    const client = createPortalQueryClient();
    const home = render(
      <QueryClientProvider client={client}>
        <HomeConsumers />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(counts["/policies"]).toBe(1));
    home.unmount();

    // Navigate to "Policies" (same client, within staleTime) — cache hit.
    render(
      <QueryClientProvider client={client}>
        <PoliciesConsumer />
      </QueryClientProvider>,
    );
    // Give any (unwanted) refetch a chance to fire, then assert it didn't.
    await new Promise((r) => setTimeout(r, 50));
    expect(counts["/policies"]).toBe(1);
    expect(counts["/policies/runs"]).toBe(1);
  });
});
