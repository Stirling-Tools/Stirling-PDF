import { http, HttpResponse, delay } from "msw";

/**
 * Mock mode for the SaaS Users page: serves the SaasTeamController routes the
 * SaaS `usersBackend` adapter calls (`/api/v1/team/*`). A tiny in-memory store
 * makes invite / cancel / remove / rename reflect, so the page is exercisable
 * without a live SaaS backend. NOT registered in embeddedDataHandlers - these
 * paths overlap the editor's own team feature when portal shares its origin.
 */

interface TeamDetailsDTO {
  teamId: number;
  name: string;
  teamType: string;
  isPersonal: boolean;
  memberCount: number;
  seatCount: number;
  seatsUsed: number;
  maxSeats: number;
  isLeader: boolean;
}

interface TeamMemberDTO {
  id: number;
  username: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface InvitationDTO {
  invitationId: number;
  teamName: string;
  inviterEmail: string;
  inviteeEmail: string;
  invitationToken: string;
  status: string;
  expiresAt: string;
}

const TEAM_ID = 1;
const TEAM_NAME = "Acme";

interface Store {
  teamName: string;
  maxSeats: number;
  members: TeamMemberDTO[];
  invitations: InvitationDTO[];
  nextInvitationId: number;
  nextMemberId: number;
}

function seed(): Store {
  return {
    teamName: TEAM_NAME,
    maxSeats: 10,
    members: [
      {
        id: 1,
        username: "leader@acme.com",
        email: "leader@acme.com",
        role: "LEADER",
        joinedAt: "2026-01-05T09:00:00Z",
      },
      {
        id: 2,
        username: "priya@acme.com",
        email: "priya@acme.com",
        role: "MEMBER",
        joinedAt: "2026-02-11T09:00:00Z",
      },
      {
        id: 3,
        username: "marcus@acme.com",
        email: "marcus@acme.com",
        role: "MEMBER",
        joinedAt: "2026-03-02T09:00:00Z",
      },
    ],
    invitations: [
      {
        invitationId: 101,
        teamName: TEAM_NAME,
        inviterEmail: "leader@acme.com",
        inviteeEmail: "sam.lee@acme.com",
        invitationToken: "tok-sam",
        status: "PENDING",
        expiresAt: "2026-12-31T00:00:00Z",
      },
    ],
    nextInvitationId: 102,
    nextMemberId: 4,
  };
}

let store: Store = seed();

/** Reset the SaaS team store between tests. */
export function resetTeamSaasStore(): void {
  store = seed();
}

function pendingCount(): number {
  return store.invitations.filter((i) => i.status === "PENDING").length;
}

function teamDetails(): TeamDetailsDTO {
  return {
    teamId: TEAM_ID,
    name: store.teamName,
    teamType: "PRO",
    isPersonal: false,
    memberCount: store.members.length,
    seatCount: store.maxSeats,
    seatsUsed: store.members.length + pendingCount(),
    maxSeats: store.maxSeats,
    isLeader: true,
  };
}

export const teamSaasHandlers = [
  http.get("/api/v1/team/my", async () => {
    await delay(80);
    return HttpResponse.json([teamDetails()]);
  }),
  http.get("/api/v1/team/:teamId/members", () =>
    HttpResponse.json(store.members),
  ),
  http.get("/api/v1/team/:teamId/invitations", () =>
    HttpResponse.json(store.invitations),
  ),
  http.post("/api/v1/team/invite", async ({ request }) => {
    const body = (await request.json()) as { teamId: number; email: string };
    const invitation: InvitationDTO = {
      invitationId: store.nextInvitationId++,
      teamName: store.teamName,
      inviterEmail: "leader@acme.com",
      inviteeEmail: body.email,
      invitationToken: `tok-${body.email}`,
      status: "PENDING",
      expiresAt: "2026-12-31T00:00:00Z",
    };
    store.invitations.push(invitation);
    return HttpResponse.json(invitation);
  }),
  http.delete("/api/v1/team/invitations/:invitationId", ({ params }) => {
    const id = Number(params.invitationId);
    const inv = store.invitations.find((i) => i.invitationId === id);
    if (!inv) {
      return HttpResponse.json(
        { error: "Invitation not found" },
        { status: 404 },
      );
    }
    inv.status = "CANCELLED";
    return HttpResponse.json({ message: "Invitation cancelled" });
  }),
  http.delete("/api/v1/team/:teamId/members/:memberId", ({ params }) => {
    const id = Number(params.memberId);
    const before = store.members.length;
    store.members = store.members.filter((m) => m.id !== id);
    if (store.members.length === before) {
      return HttpResponse.json({ error: "Member not found" }, { status: 400 });
    }
    return HttpResponse.json({ message: "Member removed successfully" });
  }),
  http.post("/api/v1/team/:teamId/rename", async ({ request }) => {
    const body = (await request.json()) as { newName: string };
    store.teamName = body.newName;
    return HttpResponse.json({
      message: "Team renamed successfully",
      newName: body.newName,
    });
  }),
];
