import type { Meta, StoryObj } from "@storybook/react-vite";
import { InviteMemberModal } from "@portal/components/users/InviteMemberModal";
import type { Team } from "@portal/api/teams";

const TEAMS: Team[] = [
  { id: 1, name: "Default", userCount: 4, owners: [] },
  { id: 2, name: "Engineering", userCount: 3, owners: ["tom"] },
  { id: 3, name: "Compliance", userCount: 2, owners: ["dana"] },
];

const meta: Meta<typeof InviteMemberModal> = {
  title: "Portal/Users/InviteMemberModal",
  component: InviteMemberModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    onClose: () => {},
    onInvited: () => {},
    teams: TEAMS,
  },
};
export default meta;
type Story = StoryObj<typeof InviteMemberModal>;

/** Invite by email with a role, team, and starting access level. */
export const Open: Story = {};

/** Opened from a team's "Add to team" — the team is preselected. */
export const ScopedToTeam: Story = {
  args: { defaultTeamId: 2 },
};

/** Self-hosted with password login + SSO: the "Create account" mode is offered. */
export const SelfHostedDirectCreate: Story = {
  args: { canDirectCreate: true, hasOauth: true, hasSaml: true },
};

export const Closed: Story = { args: { open: false } };
