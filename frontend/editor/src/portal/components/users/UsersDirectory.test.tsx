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

// Label and count are separate spans, so the accessible name may or may not
// carry a space between them depending on the accname implementation.
function teamTab(label: string, count: number) {
  return screen.getByRole("button", {
    name: new RegExp(`^${label}\\s*${count}$`),
  });
}

function renderDirectory(
  caps: typeof saasCaps,
  teams: Team[] = TEAMS,
  seatsFull = false,
  members: Member[] = [MEMBER],
) {
  const onRemove = vi.fn();
  render(
    <MantineProvider>
      <UsersDirectory
        members={members}
        teams={teams}
        capabilities={caps}
        seatsFull={seatsFull}
        processorTeamIds={new Set()}
        onChangeRole={vi.fn()}
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
        onRemove={onRemove}
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
    fireEvent.click(teamTab("My Team", 1));
    // No team kebab at all (rename is the only would-be item on SaaS).
    expect(
      screen.queryByRole("button", { name: "Team actions" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Rename team")).not.toBeInTheDocument();
  });

  it("offers to create a team from the self-hosted Default team", async () => {
    renderDirectory(selfHostedCaps, [
      { id: 1, name: "Default", userCount: 1, owners: [] },
    ]);
    fireEvent.click(teamTab("Default", 1));
    fireEvent.click(screen.getByRole("button", { name: "Team actions" }));

    expect(
      await screen.findByText("Create team from Default"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Delete team")).not.toBeInTheDocument();
  });

  it("offers a team with no members yet, so its first member can be added", () => {
    renderDirectory(selfHostedCaps, [
      ...TEAMS,
      { id: 2, name: "Brand new", userCount: 0, owners: [] },
    ]);

    const tab = teamTab("Brand new", 0);
    expect(screen.queryByText("Add to team")).not.toBeInTheDocument();
    fireEvent.click(tab);
    expect(screen.getByText("Add to team")).toBeInTheDocument();
  });

  it("blocks 'Add to team' once every licensed seat is taken", () => {
    renderDirectory(selfHostedCaps, TEAMS, true);
    fireEvent.click(teamTab("Acme", 1));
    expect(screen.getByText("Add to team").closest("button")).toBeDisabled();
  });
});

describe("UsersDirectory — team strip", () => {
  it("hides identity and status columns that contain no distinct values", () => {
    const emailOnlyMember = {
      ...MEMBER,
      name: MEMBER.email,
    };
    renderDirectory(selfHostedCaps, TEAMS, false, [emailOnlyMember]);

    expect(
      screen.queryByRole("columnheader", { name: "Email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Status" }),
    ).not.toBeInTheDocument();
  });

  it("shows identity and status columns when they carry information", () => {
    renderDirectory(selfHostedCaps, TEAMS, false, [
      { ...MEMBER, status: "suspended" },
    ]);
    expect(screen.getByRole("columnheader", { name: "Email" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeVisible();
  });

  it("narrows the flat roster to the selected team", () => {
    const other: Member = {
      ...MEMBER,
      id: "3",
      name: "Tom",
      email: "tom@acme.com",
      teamId: 2,
      teamName: "Brand new",
    };
    render(
      <MantineProvider>
        <UsersDirectory
          members={[MEMBER, other]}
          teams={[
            ...TEAMS,
            { id: 2, name: "Brand new", userCount: 1, owners: [] },
          ]}
          capabilities={selfHostedCaps}
          processorTeamIds={new Set()}
          onChangeRole={vi.fn()}
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
          onRemove={vi.fn()}
          onRenameTeam={vi.fn()}
          onDeleteTeam={vi.fn()}
        />
      </MantineProvider>,
    );

    expect(teamTab("All", 2)).toBeInTheDocument();
    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.getByText("Tom")).toBeInTheDocument();

    fireEvent.click(teamTab("Acme", 1));
    expect(screen.getByText("Priya")).toBeInTheDocument();
    expect(screen.queryByText("Tom")).not.toBeInTheDocument();
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
