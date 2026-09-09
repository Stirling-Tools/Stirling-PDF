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
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  teamSaasHandlers,
  resetTeamSaasStore,
} from "@portal/mocks/handlers/teamSaas";

// apiClient.local attaches a stored bearer + (transitively) touches the Supabase
// client at import; stub both so the local transport stays hermetic. MSW
// intercepts the relative /api/v1/team/* URLs regardless of the (absent) token.
vi.mock("@app/auth", () => ({
  getStoredToken: () => null,
  clearStoredToken: vi.fn(),
}));
vi.mock("@app/auth/supabase/supabaseClient", () => ({
  getSupabaseClient: () => null,
  configureSupabase: vi.fn(),
}));
vi.mock("@portal/auth/saasSupabase", () => ({ ensureSaasSupabase: vi.fn() }));

// The SaaS usersBackend lives under src/saas; the portal vitest project resolves
// @app to proprietary (there's no @saas alias here), so the SaaS impl can only be
// exercised by importing it directly by path.
// eslint-disable-next-line no-restricted-imports
import { usersBackend } from "../../saas/portal/usersBackend";

const server = setupServer(...teamSaasHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => resetTeamSaasStore());

describe("saas usersBackend — fetchUsers mapping", () => {
  it("maps SaasTeamController members + invitations onto UsersResponse", async () => {
    const res = await usersBackend.fetchUsers("pro");

    // 3 members from the store; leader → team_owner, the rest → member.
    expect(res.members).toHaveLength(3);
    const leader = res.members.find((m) => m.email === "leader@acme.com")!;
    expect(leader.role).toBe("team_owner");
    expect(leader.teamLead).toBe(true);
    // Leader is the viewer on SaaS → self (self-remove disabled) + portal access.
    expect(leader.isSelf).toBe(true);
    expect(leader.canAccessPortal).toBe(true);
    expect(leader.teamId).toBe(1);

    const member = res.members.find((m) => m.email === "priya@acme.com")!;
    expect(member.role).toBe("member");
    expect(member.isSelf).toBeFalsy();
    expect(member.canAccessPortal).toBe(false);
    // Backend numeric id is preserved for the remove call.
    expect(member.id).toBe("2");

    // One pending invitation mapped onto PendingInvitation.
    expect(res.invitations).toHaveLength(1);
    expect(res.invitations![0]).toMatchObject({
      id: 101,
      email: "sam.lee@acme.com",
      invitedBy: "leader@acme.com",
    });
  });

  it("derives summary + seats from the resolved team", async () => {
    const res = await usersBackend.fetchUsers("pro");
    expect(res.summary.totalMembers).toBe(3);
    expect(res.summary.pendingInvites).toBe(1);
    // Store seatsUsed = members (3) + pending (1).
    expect(res.summary.seatsUsed).toBe(4);
    expect(res.summary.seatLimit).toBe(10);
    expect(res.access).toEqual({ tier: "pro", seatsUsed: 4, seatLimit: 10 });
    // SaaS always has email; not gated on a self-hosted SMTP config.
    expect(res.mailEnabled).toBe(true);
    expect(res.emailInvitesEnabled).toBe(true);
  });

  it("excludes non-pending invitations", async () => {
    await usersBackend.cancelInvitation(101);
    const res = await usersBackend.fetchUsers("pro");
    expect(res.invitations).toHaveLength(0);
    expect(res.summary.pendingInvites).toBe(0);
  });

  it("drops PENDING invitations whose expiry has already passed", async () => {
    server.use(
      http.get("/api/v1/team/:teamId/invitations", () =>
        HttpResponse.json([
          {
            invitationId: 201,
            teamName: "Acme",
            inviterEmail: "leader@acme.com",
            inviteeEmail: "expired@acme.com",
            invitationToken: "t1",
            status: "PENDING",
            expiresAt: "2000-01-01T00:00:00Z",
          },
          {
            invitationId: 202,
            teamName: "Acme",
            inviterEmail: "leader@acme.com",
            inviteeEmail: "live@acme.com",
            invitationToken: "t2",
            status: "PENDING",
            expiresAt: "2999-01-01T00:00:00Z",
          },
        ]),
      ),
    );
    const res = await usersBackend.fetchUsers("pro");
    expect(res.invitations!.map((i) => i.email)).toEqual(["live@acme.com"]);
    expect(res.summary.pendingInvites).toBe(1);
  });
});

describe("saas usersBackend — teams + auth config", () => {
  it("fetchTeams returns the single resolved team", async () => {
    const teams = await usersBackend.fetchTeams();
    expect(teams).toEqual([
      { id: 1, name: "Acme", userCount: 3, owners: [], isPersonal: false },
    ]);
  });

  it("fetchAuthConfig is static (no direct-create, no OAuth/SAML)", async () => {
    const cfg = await usersBackend.fetchAuthConfig();
    expect(cfg).toEqual({
      canDirectCreate: false,
      hasOauth: false,
      hasSaml: false,
    });
  });
});

describe("saas usersBackend — mutations hit SaasTeamController", () => {
  it("inviteMember POSTs /invite with teamId+email and shows as pending", async () => {
    let seenBody: unknown = null;
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && request.url.endsWith("/team/invite")) {
        seenBody = await request.clone().json();
      }
    });
    const result = await usersBackend.inviteMember("new@acme.com", "member");
    expect(result.successCount).toBe(1);
    expect(seenBody).toMatchObject({ teamId: 1, email: "new@acme.com" });
    server.events.removeAllListeners();

    const res = await usersBackend.fetchUsers("pro");
    expect(res.invitations!.map((i) => i.email)).toContain("new@acme.com");
  });

  it("renameTeam POSTs /{teamId}/rename and the new name is read back", async () => {
    await usersBackend.renameTeam(1, "Beta");
    const teams = await usersBackend.fetchTeams();
    expect(teams[0].name).toBe("Beta");
  });

  it("removeMember DELETEs the team member and drops them from the roster", async () => {
    const before = await usersBackend.fetchUsers("pro");
    const target = before.members.find((m) => m.email === "priya@acme.com")!;
    await usersBackend.removeMember(target);
    const after = await usersBackend.fetchUsers("pro");
    expect(after.members.map((m) => m.email)).not.toContain("priya@acme.com");
    expect(after.members).toHaveLength(2);
  });

  it("removeMember throws when the member has no team", async () => {
    await expect(
      usersBackend.removeMember({
        id: "9",
        name: "x",
        email: "x@acme.com",
        role: "member",
        status: "active",
        lastActive: "-",
      }),
    ).rejects.toThrow(/no team/i);
  });

  it("cancelInvitation DELETEs the invitation", async () => {
    let seenUrl: string | null = null;
    server.events.on("request:start", ({ request }) => {
      if (
        request.method === "DELETE" &&
        request.url.includes("/invitations/")
      ) {
        seenUrl = request.url;
      }
    });
    await usersBackend.cancelInvitation(101);
    expect(seenUrl).toContain("/api/v1/team/invitations/101");
    server.events.removeAllListeners();
  });
});
