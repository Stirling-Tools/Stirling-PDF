import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string, opts?: Record<string, unknown>) => {
      const base = fallback ?? key;
      return opts
        ? base.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts[k] ?? ""))
        : base;
    },
  }),
}));

import { UsersDirectory } from "@portal/components/users/UsersDirectory";
import type { Member } from "@portal/api/users";
import type { Team } from "@portal/api/teams";
// Prove the gating against the real flavor capability files. The portal vitest
// project resolves @app to proprietary and has no @saas alias, so the SaaS set is
// reached by path; the self-hosted set uses the @proprietary alias.
// oxlint-disable-next-line no-restricted-imports
import { usersCapabilities as saasCaps } from "../../../saas/portal/usersCapabilities";
import { usersCapabilities as selfHostedCaps } from "@proprietary/portal/usersCapabilities";

const MEMBER: Member = {
  id: "2",
  name: "Priya",
  email: "priya@acme.com",
  username: "priya@acme.com",
  role: "member",
  status: "active",
  lastActive: "-",
  teamId: 1,
  teamName: "Acme",
};
const TEAMS: Team[] = [{ id: 1, name: "Acme", userCount: 1, owners: [] }];

function renderDirectory(
  caps: typeof saasCaps,
  teams: Team[] = TEAMS,
  members: Member[] = [MEMBER],
  onTransferOwnership = vi.fn(),
  onChangeRole = vi.fn(),
  emailInvitesEnabled = true,
) {
  const onRemove = vi.fn();
  render(
    <MantineProvider>
      <UsersDirectory
        members={members}
        teams={teams}
        capabilities={caps}
        processorTeamIds={new Set()}
        onChangeRole={onChangeRole}
        onGrantProcessor={vi.fn()}
        onRevokeProcessor={vi.fn()}
        onGrantTeamProcessor={vi.fn()}
        onRevokeTeamProcessor={vi.fn()}
        onAddToTeam={vi.fn()}
        onResetPassword={vi.fn()}
        onMoveToTeam={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUnlock={vi.fn()}
        onDisableMfa={vi.fn()}
        onResendInvite={vi.fn()}
        emailInvitesEnabled={emailInvitesEnabled}
        onRemove={onRemove}
        onTransferOwnership={onTransferOwnership}
        onRenameTeam={vi.fn()}
        onDeleteTeam={vi.fn()}
      />
    </MantineProvider>,
  );
  return onRemove;
}

describe("UsersDirectory — remove action gating", () => {
  it("SaaS (team scope) offers 'Remove from team'", async () => {
    const onRemove = renderDirectory(saasCaps);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Priya" }));
    const item = await screen.findByText("Remove from team");
    fireEvent.click(item);
    expect(onRemove).toHaveBeenCalledWith(MEMBER);
    expect(screen.queryByText("Remove from org")).not.toBeInTheDocument();
  });

  it("self-hosted (org scope) offers 'Remove from org'", async () => {
    renderDirectory(selfHostedCaps);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Priya" }));
    expect(await screen.findByText("Remove from org")).toBeInTheDocument();
    expect(screen.queryByText("Remove from team")).not.toBeInTheDocument();
  });

  it("hides the Rename control for a SaaS personal team (backend rejects it)", () => {
    const personalTeam: Team[] = [
      { id: 1, name: "My Team", userCount: 1, owners: [], isPersonal: true },
    ];
    renderDirectory(saasCaps, personalTeam);
    // No team-header kebab at all (rename is the only would-be item on SaaS).
    expect(
      screen.queryByRole("button", { name: "Team actions" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Rename team")).not.toBeInTheDocument();
  });

  it("lists a team with no members yet, so its first member can be added", () => {
    renderDirectory(selfHostedCaps, [
      ...TEAMS,
      { id: 2, name: "Brand new", userCount: 0, owners: [] },
    ]);

    expect(screen.getByText("Brand new team")).toBeInTheDocument();
    expect(screen.getAllByText("Add to team")).toHaveLength(2);
  });
});

describe("UsersDirectory — never-used invites", () => {
  const INVITED: Member = { ...MEMBER, invitePending: true };

  it("self-hosted marks an unused invite and offers Resend invite", async () => {
    renderDirectory(selfHostedCaps, TEAMS, [INVITED]);
    expect(screen.getByText("Invited")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Priya" }));
    expect(await screen.findByText("Resend invite")).toBeInTheDocument();
  });

  it("leaves a directly-created account alone: forcing a password change is not an invite", async () => {
    renderDirectory(selfHostedCaps);
    expect(screen.queryByText("Invited")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Priya" }));
    await screen.findByText("Remove from org");
    expect(screen.queryByText("Resend invite")).not.toBeInTheDocument();
  });

  it("hides the resend when the server has no working invite mail config", async () => {
    renderDirectory(selfHostedCaps, TEAMS, [INVITED], vi.fn(), vi.fn(), false);
    expect(screen.getByText("Invited")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Priya" }));
    await screen.findByText("Remove from org");
    expect(screen.queryByText("Resend invite")).not.toBeInTheDocument();
  });

  it("SaaS has no resend path: its invites are pending records, not accounts", async () => {
    renderDirectory(saasCaps, TEAMS, [INVITED]);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Priya" }));
    await screen.findByText("Remove from team");
    expect(screen.queryByText("Resend invite")).not.toBeInTheDocument();
  });
});

describe("flavor capabilities — invitations + remove scope", () => {
  it("SaaS manages invitations and removes at team scope", () => {
    expect(saasCaps.manageInvitations).toBe(true);
    expect(saasCaps.removeScope).toBe("team");
    // No SaaS user is ever ROLE_ADMIN.
    expect(saasCaps.adminRole).toBe(false);
  });

  it("self-hosted has no pending-invite management and removes at org scope", () => {
    expect(selfHostedCaps.manageInvitations).toBe(false);
    expect(selfHostedCaps.removeScope).toBe("org");
  });
});

const OWNER: Member = {
  ...MEMBER,
  id: "1",
  name: "Owner",
  username: "owner",
  role: "admin",
  orgOwner: true,
  isSelf: true,
};

it("presents ownership as the selected role and confirms a transfer from the role dropdown", () => {
  const transfer = vi.fn();
  const changeRole = vi.fn();
  renderDirectory(selfHostedCaps, TEAMS, [OWNER, MEMBER], transfer, changeRole);
  expect(screen.getByRole("textbox", { name: "Role for Owner" })).toHaveValue(
    "Org Owner",
  );
  expect(
    screen.getByRole("textbox", { name: "Role for Owner" }),
  ).toHaveAttribute("readonly");
  fireEvent.click(screen.getByRole("textbox", { name: "Role for Priya" }));
  fireEvent.click(screen.getByRole("option", { name: "Org Owner" }));
  expect(transfer).toHaveBeenCalledWith(MEMBER);
  expect(changeRole).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "Role for Priya" })).toHaveValue(
    "Member",
  );
});

it("protects the owner when viewed by a second admin", () => {
  renderDirectory(selfHostedCaps, TEAMS, [
    { ...OWNER, isSelf: false },
    { ...MEMBER, role: "admin", isSelf: true },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Actions for Owner" }));
  expect(
    screen.queryByRole("menuitem", { name: "Transfer ownership" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("menuitem", { name: "Reset password" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("menuitem", { name: "Remove from org" }),
  ).toBeDisabled();
});

it.each([
  { isFirstLogin: true },
  { status: "suspended" as const },
  { locked: true },
])("does not offer ownership to an ineligible recipient: %j", (state) => {
  renderDirectory(selfHostedCaps, TEAMS, [OWNER, { ...MEMBER, ...state }]);
  fireEvent.click(screen.getByRole("textbox", { name: "Role for Priya" }));
  expect(
    screen.queryByRole("option", { name: "Org Owner" }),
  ).not.toBeInTheDocument();
});

it("does not offer ownership in another admin's role dropdown", () => {
  renderDirectory(selfHostedCaps, TEAMS, [{ ...OWNER, isSelf: false }, MEMBER]);
  fireEvent.click(screen.getByRole("textbox", { name: "Role for Priya" }));
  expect(
    screen.queryByRole("option", { name: "Org Owner" }),
  ).not.toBeInTheDocument();
});

it("offers Team Lead as a team-scoped role rather than a capability", () => {
  const changeRole = vi.fn();
  renderDirectory(selfHostedCaps, TEAMS, [OWNER, MEMBER], vi.fn(), changeRole);
  fireEvent.click(screen.getByRole("textbox", { name: "Role for Priya" }));
  fireEvent.click(screen.getByRole("option", { name: "Team Lead" }));
  expect(changeRole).toHaveBeenCalledWith(MEMBER, "team_owner");
});

it("offers SaaS ownership transfer in the shared settings roster", () => {
  const transfer = vi.fn();
  renderDirectory(
    saasCaps,
    [{ ...TEAMS[0], isPersonal: false }],
    [{ ...OWNER, role: "team_owner", orgOwner: false, teamLead: true }, MEMBER],
    transfer,
  );
  fireEvent.click(screen.getByRole("textbox", { name: "Role for Priya" }));
  fireEvent.click(screen.getByRole("option", { name: "Org Owner" }));
  expect(transfer).toHaveBeenCalledWith(MEMBER);
});

describe("read-only role visibility", () => {
  it("keeps the owner visible to members after transfer without allowing changes", () => {
    const owner = {
      ...MEMBER,
      id: "1",
      name: "Alex",
      role: "team_owner" as const,
      teamLead: true,
    };
    const viewer = { ...MEMBER, isSelf: true };
    const transfer = vi.fn();
    renderDirectory(
      {
        ...saasCaps,
        changeRole: false,
        transferOwnership: false,
        removeMember: false,
      },
      TEAMS,
      [owner, viewer],
      transfer,
    );
    expect(screen.getByRole("textbox", { name: "Role for Alex" })).toHaveValue(
      "Org Owner",
    );
    expect(
      screen.getByRole("textbox", { name: "Role for Alex" }),
    ).toHaveAttribute("readonly");
    expect(screen.getByRole("textbox", { name: "Role for Priya" })).toHaveValue(
      "Member",
    );
    expect(transfer).not.toHaveBeenCalled();
  });
});

it("keeps self-hosted Admin and Team Lead labels readable without editing rights", () => {
  const members = [
    { ...MEMBER, id: "1", name: "Admin", role: "admin" as const },
    { ...MEMBER, name: "Lead", role: "team_owner" as const, teamLead: true },
  ];
  renderDirectory(
    { ...selfHostedCaps, changeRole: false, transferOwnership: false },
    TEAMS,
    members,
  );
  expect(screen.getByRole("textbox", { name: "Role for Admin" })).toHaveValue(
    "Admin",
  );
  expect(screen.getByRole("textbox", { name: "Role for Lead" })).toHaveValue(
    "Team Lead",
  );
});
