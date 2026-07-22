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
import { render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import {
  teamSaasHandlers,
  resetTeamSaasStore,
} from "@portal/mocks/handlers/teamSaas";
import { createPortalQueryClient } from "@portal/queryClient";
import { setFlag } from "@portal/dev/featureFlags";
import { qk } from "@portal/queries/keys";

/**
 * The point of the whole evaluation, as an assertion: with the `reactQuery`
 * flag OFF the roster is refetched on every remount (navigate away + back),
 * and with it ON the second mount is served from the shared cache with NO
 * network call. Same <Users> view, same SaaS mocks as Users.saas.test.tsx —
 * only the data layer differs.
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
afterEach(() => {
  server.resetHandlers();
  setFlag("reactQuery", false);
});
afterAll(() => {
  server.events.removeAllListeners();
  server.close();
});
beforeEach(() => {
  resetTeamSaasStore();
  rosterFetches = 0;
  teamMyFetches = 0;
});

describe("Users data layer — before/after the reactQuery flag", () => {
  it("legacy path refetches the roster on every remount", async () => {
    setFlag("reactQuery", false);

    const first = render(
      <MantineProvider>
        <MemoryRouter>
          <Users />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByText("leader@acme.com")).toBeInTheDocument();
    expect(rosterFetches).toBe(1);
    first.unmount();

    // Remounting (navigate away + back) fires a fresh fetch — no cache.
    render(
      <MantineProvider>
        <MemoryRouter>
          <Users />
        </MemoryRouter>
      </MantineProvider>,
    );
    expect(await screen.findByText("leader@acme.com")).toBeInTheDocument();
    expect(rosterFetches).toBe(2);
  });

  it("react-query path serves the roster from cache on remount (no refetch)", async () => {
    setFlag("reactQuery", true);
    // One client shared across both mounts — the real app keeps it at the
    // portal root (PortalApp), above the router, for exactly this reason.
    const client = createPortalQueryClient();

    const first = render(
      <MantineProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Users />
          </MemoryRouter>
        </QueryClientProvider>
      </MantineProvider>,
    );
    expect(await screen.findByText("leader@acme.com")).toBeInTheDocument();
    expect(rosterFetches).toBe(1);
    first.unmount();

    // Remount within staleTime → the roster comes straight from the cache.
    render(
      <MantineProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Users />
          </MemoryRouter>
        </QueryClientProvider>
      </MantineProvider>,
    );
    expect(await screen.findByText("leader@acme.com")).toBeInTheDocument();
    expect(rosterFetches).toBe(1);
  });

  it("collapses the SaaS /team/my call to one per mount", async () => {
    setFlag("reactQuery", true);
    // createPortalQueryClient sets the module singleton that the SaaS
    // usersBackend's resolveTeam reads via ensureQueryData.
    const client = createPortalQueryClient();

    render(
      <MantineProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <Users />
          </MemoryRouter>
        </QueryClientProvider>
      </MantineProvider>,
    );
    await screen.findByText("leader@acme.com");

    // The roster query and the teams query both resolve the team, but share the
    // cached qk.teamMy() entry — so /team/my is hit once, not twice.
    expect(teamMyFetches).toBe(1);
    expect(client.getQueryData(qk.teamMy())).toBeDefined();
  });
});
