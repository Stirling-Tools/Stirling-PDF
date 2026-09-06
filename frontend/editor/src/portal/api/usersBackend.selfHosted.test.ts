import { afterEach, describe, expect, it, vi } from "vitest";

// The roster itself is exercised elsewhere; here the subject is only how the
// self-hosted backend folds unredeemed invite links into `invitations`.
const fetchAdminUsers = vi.fn();
const listInviteLinks = vi.fn();

vi.mock("@portal/api/users", () => ({
  fetchUsers: (...args: unknown[]) => fetchAdminUsers(...args),
  fetchAuthConfig: vi.fn(),
  inviteMember: vi.fn(),
  removeMember: vi.fn(),
}));
vi.mock("@portal/api/inviteLinks", () => ({
  listInviteLinks: () => listInviteLinks(),
  revokeInviteLink: vi.fn(),
}));
vi.mock("@portal/api/teams", () => ({
  fetchTeams: vi.fn(),
  renameTeam: vi.fn(),
}));

import { usersBackend } from "@proprietary/portal/usersBackend";

const ROSTER = {
  summary: { totalMembers: 1, pendingInvites: 2, seatsUsed: 1, seatLimit: 5 },
  members: [],
  roles: [],
  access: { tier: "pro", seatsUsed: 1, seatLimit: 5 },
  mailEnabled: true,
  emailInvitesEnabled: true,
  inviteLinksEnabled: true,
};

afterEach(() => vi.clearAllMocks());

describe("self-hosted usersBackend — pending invite links", () => {
  it("maps unredeemed links onto the shared invitations list", async () => {
    fetchAdminUsers.mockResolvedValue(ROSTER);
    listInviteLinks.mockResolvedValue([
      {
        id: 7,
        email: "bound@acme.com",
        role: "ROLE_USER",
        createdBy: "admin",
        createdAt: "2026-09-01T00:00:00",
        expiresAt: "2026-09-04T00:00:00",
      },
      {
        id: 8,
        email: null,
        role: "ROLE_USER",
        createdBy: "admin",
        createdAt: "2026-09-01T00:00:00",
        expiresAt: "2026-09-04T00:00:00",
      },
    ]);

    const res = await usersBackend.fetchUsers("pro");

    expect(res.invitations).toEqual([
      {
        id: 7,
        email: "bound@acme.com",
        invitedBy: "admin",
        expiresAt: "2026-09-04T00:00:00",
      },
      // A general link has no invitee; the row names it rather than showing null.
      {
        id: 8,
        email: "",
        invitedBy: "admin",
        expiresAt: "2026-09-04T00:00:00",
      },
    ]);
  });

  it("still returns the roster when the link listing fails", async () => {
    fetchAdminUsers.mockResolvedValue(ROSTER);
    listInviteLinks.mockRejectedValue(new Error("403"));

    const res = await usersBackend.fetchUsers("pro");

    expect(res.members).toEqual([]);
    expect(res.invitations).toEqual([]);
  });
});
