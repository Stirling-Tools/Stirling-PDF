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
// eslint-disable-next-line no-restricted-imports
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

function renderDirectory(caps: typeof saasCaps, teams: Team[] = TEAMS) {
  const onRemove = vi.fn();
  render(
    <MantineProvider>
      <UsersDirectory
        members={[MEMBER]}
        teams={teams}
        capabilities={caps}
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
    // No team-header kebab at all (rename is the only would-be item on SaaS).
    expect(
      screen.queryByRole("button", { name: "Team actions" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Rename team")).not.toBeInTheDocument();
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
