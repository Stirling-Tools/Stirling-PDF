import { UIProvider } from "@portal/contexts/UIContext";
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
import { PortalTestProviders } from "@portal/test/TestQueryProvider";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
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
  // oxlint-disable-next-line no-restricted-imports -- resolve the real SaaS module past the mocked @app alias
  usersCapabilities: (await import("../../saas/portal/usersCapabilities"))
    .usersCapabilities,
}));
vi.mock("@app/portal/usersBackend", async () => ({
  // oxlint-disable-next-line no-restricted-imports -- resolve the real SaaS module past the mocked @app alias
  usersBackend: (await import("../../saas/portal/usersBackend")).usersBackend,
}));

vi.mock("@portal/contexts/TierContext", () => ({
  useTier: () => ({ tier: "pro" }),
}));

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  const { createInstance } = await import("i18next");
  const i18n = createInstance();
  await i18n.use(actual.initReactI18next).init({
    lng: "en",
    resources: {},
    interpolation: { escapeValue: false },
  });
  return { ...actual, useTranslation: () => ({ t: i18n.t, i18n }) };
});

import { Users } from "@portal/views/Users";

const server = setupServer(...teamSaasHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  resetTeamSaasStore();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

function renderUsers() {
  return render(
    <PortalTestProviders>
      <MemoryRouter>
        <UIProvider>
          <Users />
        </UIProvider>
      </MemoryRouter>
    </PortalTestProviders>,
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
      .closest("table") as HTMLElement;
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

function ownershipScenario(
  ownerless = false,
  fail = false,
  linkedInstances = 0,
) {
  let ownerId = ownerless ? 0 : 1;
  server.use(
    http.get("/api/v1/team/my", () =>
      HttpResponse.json([
        {
          teamId: 9,
          name: "Personal",
          isPersonal: true,
          isLeader: true,
          current: false,
          currentUserId: 1,
        },
        {
          teamId: 1,
          name: "Acme",
          isPersonal: false,
          isLeader: ownerId === 1,
          current: true,
          currentUserId: 1,
          memberCount: 2,
          maxSeats: 10,
        },
      ]),
    ),
    http.get("/api/v1/team/1/members", () =>
      HttpResponse.json([
        {
          id: 1,
          username: "Alex",
          email: "alex@example.test",
          role: ownerId === 1 ? "LEADER" : "MEMBER",
        },
        {
          id: 2,
          username: "Blair",
          email: "blair@example.test",
          role: ownerId === 2 ? "LEADER" : "MEMBER",
        },
      ]),
    ),
    http.post("/api/v1/team/1/ownership/status", () =>
      HttpResponse.json({
        teamId: 1,
        teamName: "Acme",
        leaderUserId: ownerId,
        targetUserId: 2,
        linkedInstances,
        subscribed: true,
        state: ownerId === 2 ? "TRANSFERRED" : "READY",
      }),
    ),
    http.post("/api/v1/team/1/ownership/transfer", async ({ request }) => {
      expect(await request.json()).toEqual({
        email: "blair@example.test",
        expectedLeaderId: 1,
      });
      if (fail)
        return HttpResponse.json(
          { message: "Ownership changed; refresh and retry." },
          { status: 409 },
        );
      ownerId = 2;
      return HttpResponse.json({
        teamId: 1,
        teamName: "Acme",
        leaderUserId: 2,
        targetUserId: 2,
        linkedInstances,
        subscribed: true,
        state: "TRANSFERRED",
      });
    }),
    http.post("/api/v1/team/1/claim-leadership", () => {
      ownerId = 1;
      return HttpResponse.json({});
    }),
  );
  return () => ownerId;
}

describe("SaaS ownership through the current Users page", () => {
  it("directs a linked team's owner to the self-hosted Users page without transferring", async () => {
    const owner = ownershipScenario(false, false, 1);
    renderUsers();
    fireEvent.click(
      await screen.findByRole("textbox", { name: "Role for Blair" }),
    );
    fireEvent.click(
      within(
        await screen.findByRole("listbox", {
          name: "Role for Blair",
          hidden: true,
        }),
      ).getByRole("option", { name: "Org Owner", hidden: true }),
    );
    expect(
      await screen.findByText("Start from your self-hosted server"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Transfer ownership" }),
    ).toBeNull();
    expect(owner()).toBe(1);
  });

  it("transfers through the role menu and keeps the former owner's shared roster visible", async () => {
    const owner = ownershipScenario();
    renderUsers();
    fireEvent.click(
      await screen.findByRole("textbox", { name: "Role for Blair" }),
    );
    fireEvent.click(
      within(
        await screen.findByRole("listbox", {
          name: "Role for Blair",
          hidden: true,
        }),
      ).getByRole("option", { name: "Org Owner", hidden: true }),
    );
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Role for Blair" }),
      ).toHaveValue("Org Owner"),
    );
    expect(owner()).toBe(2);
    expect(screen.getByRole("textbox", { name: "Role for Alex" })).toHaveValue(
      "Member",
    );
    expect(
      screen.queryByRole("button", { name: "Invite people" }),
    ).not.toBeInTheDocument();
  });
  it("recovers an ownerless shared team from the reader's roster", async () => {
    const owner = ownershipScenario(true);
    renderUsers();
    fireEvent.click(
      await screen.findByRole("button", { name: "Become team owner" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("textbox", { name: "Role for Alex" }),
      ).toHaveValue("Org Owner"),
    );
    expect(owner()).toBe(1);
    expect(
      screen.queryByRole("button", { name: "Become team owner" }),
    ).not.toBeInTheDocument();
  });
  it("retains the current owner when a transfer conflicts", async () => {
    const owner = ownershipScenario(false, true);
    renderUsers();
    fireEvent.click(
      await screen.findByRole("textbox", { name: "Role for Blair" }),
    );
    fireEvent.click(
      within(
        await screen.findByRole("listbox", {
          name: "Role for Blair",
          hidden: true,
        }),
      ).getByRole("option", { name: "Org Owner", hidden: true }),
    );
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Transfer ownership" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(owner()).toBe(1);
    expect(
      screen.getByRole("textbox", { name: "Role for Alex", hidden: true }),
    ).toHaveValue("Org Owner");
  });
});
