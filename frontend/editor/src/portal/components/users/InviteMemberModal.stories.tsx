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
    // Admin build: the Processor access option is offered (gated on grant management).
    manageGrants: true,
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

/** Self-hosted with mail configured: the email/create toggle is offered; opens in
 * create mode (the default when account creation is available). */
export const SelfHostedDirectCreate: Story = {
  args: {
    canDirectCreate: true,
    canEmailInvite: true,
    hasOauth: true,
    hasSaml: true,
  },
};

/** Self-hosted without SMTP/invites: no "Invite by email" option at all - just the
 * create-account form. */
export const SelfHostedNoMail: Story = {
  args: {
    canDirectCreate: true,
    canEmailInvite: false,
    hasOauth: true,
    hasSaml: true,
  },
};

/** The direct "Create account" form: username, password, sign-in method, force-MFA. */
export const CreateAccountForm: Story = {
  args: {
    canDirectCreate: true,
    hasOauth: true,
    hasSaml: true,
    initialMode: "direct",
  },
};

/** SaaS: no "admin" (Org Owner) option and no Processor grant (both admin-only). */
export const NoAdminRole: Story = {
  args: { adminRole: false, manageGrants: false },
};

export const Closed: Story = { args: { open: false } };
