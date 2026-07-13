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
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import {
  teamSaasHandlers,
  resetTeamSaasStore,
} from "@portal/mocks/handlers/teamSaas";

/**
 * End-to-end SaaS Users page: renders the real <Users> view wired for the SaaS
 * flavor (saas capabilities + saas usersBackend) against MSW handlers that mirror
 * SaasTeamController. Exercises the whole page - roster mapping, the pending-
 * invitations panel, team-scope remove, and the cancel/remove mutation flows
 * through the confirm dialog - the way a team leader would use it.
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
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

// Force the SaaS flavor: the portal vitest project resolves @app to proprietary,
// so redirect the two flavor seams to their real SaaS implementations.
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
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => resetTeamSaasStore());

function renderUsers() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("Users page (SaaS flavor, end-to-end via SaasTeamController mocks)", () => {
  it("renders the team roster and the pending-invitations panel", async () => {
    renderUsers();
    // Roster from GET /{teamId}/members.
    expect(await screen.findByText("leader@acme.com")).toBeInTheDocument();
    expect(screen.getByText("priya@acme.com")).toBeInTheDocument();
    expect(screen.getByText("marcus@acme.com")).toBeInTheDocument();
    // Pending-invitations panel (manageInvitations capability) from /{teamId}/invitations.
    expect(screen.getByText("Pending invitations")).toBeInTheDocument();
    expect(screen.getByText("sam.lee@acme.com")).toBeInTheDocument();
  });

  it("offers team-scope removal, not org deletion", async () => {
    renderUsers();
    await screen.findByText("priya@acme.com");
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for priya@acme.com" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Remove from team" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: "Remove from org" }),
    ).not.toBeInTheDocument();
  });

  it("removes a member from the team through the confirm dialog", async () => {
    renderUsers();
    await screen.findByText("priya@acme.com");
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for priya@acme.com" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Remove from team" }),
    );
    // Confirm dialog -> DELETE /{teamId}/members/{id} -> roster refetch.
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove from team" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("priya@acme.com")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("marcus@acme.com")).toBeInTheDocument();
  });

  it("cancels a pending invitation through the confirm dialog", async () => {
    renderUsers();
    await screen.findByText("sam.lee@acme.com");
    const panel = screen
      .getByText("Pending invitations")
      .closest("section") as HTMLElement;
    fireEvent.click(within(panel).getByRole("button", { name: "Cancel" }));
    // Confirm dialog -> DELETE /invitations/{id} -> refetch drops the invite.
    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel invitation" }),
    );
    await waitFor(() =>
      expect(screen.queryByText("sam.lee@acme.com")).not.toBeInTheDocument(),
    );
  });
});
