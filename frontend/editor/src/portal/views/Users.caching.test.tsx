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
import { render, screen, type RenderResult } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import {
  teamSaasHandlers,
  resetTeamSaasStore,
} from "@portal/mocks/handlers/teamSaas";
import { createPortalQueryClient } from "@portal/queryClient";
import { qk } from "@portal/queries/keys";

/**
 * The migration's payoff, as assertions: revisiting the Users view serves the
 * roster from cache with no refetch, and the SaaS roster + teams queries share
 * one /team/my resolve. Same SaaS mocks as Users.saas.test.tsx.
 */

vi.mock("@app/auth", () => ({
  getStoredToken: () => null,
  clearStoredToken: vi.fn(),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => null,
  configureSupabase: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

vi.mock("@app/portal/usersCapabilities", async () => ({
  usersCapabilities: (await import("../../saas/portal/usersCapabilities"))
    .usersCapabilities,
}));
vi.mock("@app/portal/usersBackend", async () => ({
  usersBackend: (await import("../../saas/portal/usersBackend")).usersBackend,
}));

vi.mock("@portal/contexts/TierContext", () => ({
  useTier: () => ({ tier: "pro" }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, opts?: Record<string, unknown>) => {
      const base = fallback ?? key;
      return opts
        ? base.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ""))
        : base;
    },
    i18n: { changeLanguage: vi.fn() },
  }),
}));

import { Users } from "@portal/views/Users";

const server = setupServer(...teamSaasHandlers);

let rosterFetches = 0;
let teamMyFetches = 0;
server.events.on("request:start", ({ request }) => {
  const { pathname } = new URL(request.url);
  if (pathname.endsWith("/members")) rosterFetches += 1;
  if (pathname.endsWith("/team/my")) teamMyFetches += 1;
});

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.events.removeAllListeners();
  server.close();
});
beforeEach(() => {
  resetTeamSaasStore();
  rosterFetches = 0;
  teamMyFetches = 0;
});

function renderUsers(client: QueryClient): RenderResult {
  return render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Users />
        </MemoryRouter>
      </QueryClientProvider>
    </MantineProvider>,
  );
}

describe("Users view caching", () => {
  it("serves the roster from cache on remount (no refetch)", async () => {
    // One client across both mounts — the real app keeps it at the portal root,
    // above the router, for exactly this reason.
    const client = createPortalQueryClient();

    const first = renderUsers(client);
    expect(await screen.findByText("leader@acme.com")).toBeInTheDocument();
    expect(rosterFetches).toBe(1);
    first.unmount();

    // Remount (navigate away + back) within staleTime → straight from cache.
    renderUsers(client);
    expect(await screen.findByText("leader@acme.com")).toBeInTheDocument();
    expect(rosterFetches).toBe(1);
  });

  it("collapses the SaaS /team/my call to one per mount", async () => {
    const client = createPortalQueryClient();
    renderUsers(client);
    await screen.findByText("leader@acme.com");

    // Roster + teams both resolve the team but share the cached qk.teamMy()
    // entry, so /team/my is hit once, not twice.
    expect(teamMyFetches).toBe(1);
    expect(client.getQueryData(qk.teamMy())).toBeDefined();
  });
});
