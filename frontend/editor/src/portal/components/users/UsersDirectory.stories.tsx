import type { Meta, StoryObj } from "@storybook/react-vite";
import { UsersDirectory } from "@portal/components/users/UsersDirectory";
import type { Member } from "@portal/api/users";
import type { Team } from "@portal/api/teams";
import type { UsersCapabilities } from "@portal/api/usersCapabilities";

/** Self-hosted org-admin: the full action set. */
const FULL_CAPS: UsersCapabilities = {
  orgGroup: true,
  changeRole: true,
  adminRole: true,
  createTeam: true,
  deleteTeam: true,
  renameTeam: true,
  emailInvite: true,
  directCreate: true,
  resetPassword: true,
  unlock: true,
  resetMfa: true,
  suspend: true,
  moveTeam: true,
  seats: false,
  manageGrants: true,
  removeScope: "org",
};

/** SaaS team-leader: invite / rename / remove-member only, no org group. */
const SAAS_CAPS: UsersCapabilities = {
  orgGroup: false,
  changeRole: false,
  adminRole: false,
  createTeam: false,
  deleteTeam: false,
  renameTeam: true,
  emailInvite: true,
  directCreate: false,
  resetPassword: false,
  unlock: false,
  resetMfa: false,
  suspend: false,
  moveTeam: false,
  seats: true,
  manageGrants: false,
  removeScope: "team",
};

/** A full org: one org owner and two teams, each with a leader. */
const MEMBERS: Member[] = [
  {
    id: "1",
    name: "Matt Joseph",
    email: "matt@stirlingpdf.com",
    role: "admin",
    status: "active",
    lastActive: "Now",
    username: "matt",
    teamId: 1,
    teamName: "Default",
    isSelf: true,
    portalAccess: "admin",
  },
  {
    id: "2",
    name: "Tom Reilly",
    email: "tom@stirlingpdf.com",
    role: "team_owner",
    status: "active",
    lastActive: "12m ago",
    username: "tom",
    teamId: 2,
    teamName: "Engineering",
    teamLead: true,
    portalAccess: "role",
  },
  {
    id: "3",
    name: "Sarah Kowalski",
    email: "sarah@stirlingpdf.com",
    role: "member",
    status: "active",
    lastActive: "30m ago",
    username: "sarah",
    teamId: 2,
    teamName: "Engineering",
    portalAccess: "granted",
    portalGrantId: 10,
  },
  {
    id: "4",
    name: "Priya Patel",
    email: "priya@stirlingpdf.com",
    role: "member",
    status: "active",
    lastActive: "Never",
    username: "priya",
    teamId: 2,
    teamName: "Engineering",
    portalAccess: "none",
  },
  {
    id: "5",
    name: "Dana Okafor",
    email: "dana@stirlingpdf.com",
    role: "team_owner",
    status: "active",
    lastActive: "1h ago",
    username: "dana",
    teamId: 3,
    teamName: "Compliance",
    teamLead: true,
    portalAccess: "role",
  },
  {
    id: "6",
    name: "Lars Eriksson",
    email: "lars@stirlingpdf.com",
    role: "member",
    status: "active",
    lastActive: "3h ago",
    username: "lars",
    teamId: 3,
    teamName: "Compliance",
    portalAccess: "granted",
    portalGrantId: 11,
  },
];

/** An external guest (parked concept, shown via showGuests). */
const GUEST: Member = {
  id: "7",
  name: "Meridian Legal",
  email: "legal@meridian-partners.com",
  role: "guest",
  status: "active",
  lastActive: "2d ago",
  username: "legal",
  teamId: 1,
  teamName: "Default",
  portalAccess: "none",
};

/** Members exercising the status states: suspended, locked, and MFA-enrolled. */
const STATE_MEMBERS: Member[] = [
  {
    id: "1",
    name: "Matt Joseph",
    email: "matt@stirlingpdf.com",
    role: "admin",
    status: "active",
    lastActive: "Now",
    username: "matt",
    teamId: 1,
    teamName: "Default",
    isSelf: true,
    portalAccess: "admin",
  },
  {
    id: "s1",
    name: "Nadia Costa",
    email: "nadia@acme.com",
    role: "member",
    status: "suspended",
    lastActive: "12 days ago",
    username: "nadia",
    teamId: 2,
    teamName: "Engineering",
    portalAccess: "none",
  },
  {
    id: "s2",
    name: "Leo Fischer",
    email: "leo@acme.com",
    role: "member",
    status: "active",
    lastActive: "1h ago",
    username: "leo",
    teamId: 2,
    teamName: "Engineering",
    portalAccess: "granted",
    portalGrantId: 20,
    locked: true,
  },
  {
    id: "s3",
    name: "Aisha Rahman",
    email: "aisha@acme.com",
    role: "team_owner",
    status: "active",
    lastActive: "3m ago",
    username: "aisha",
    teamId: 2,
    teamName: "Engineering",
    teamLead: true,
    portalAccess: "role",
    mfaEnabled: true,
  },
];

/** A big team (>8) to exercise the "Show all" / "Show less" expander. */
const BIG_MEMBERS: Member[] = [
  {
    id: "b0",
    name: "Matt Joseph",
    email: "matt@acme.com",
    role: "admin",
    status: "active",
    lastActive: "Now",
    username: "matt",
    teamId: 1,
    isSelf: true,
    portalAccess: "admin",
  },
  ...Array.from(
    { length: 11 },
    (_, i): Member => ({
      id: `big-${i}`,
      name: `Teammate ${i + 1}`,
      email: `teammate${i + 1}@acme.com`,
      role: i === 0 ? "team_owner" : "member",
      status: "active",
      lastActive: `${i + 1}h ago`,
      username: `tm${i + 1}`,
      teamId: 9,
      teamName: "Platform",
      teamLead: i === 0,
      portalAccess: i === 0 ? "role" : "none",
    }),
  ),
];

const TEAMS: Team[] = [
  { id: 2, name: "Engineering", userCount: 3, owners: ["tom"] },
  { id: 3, name: "Compliance", userCount: 2, owners: ["dana"] },
];

const meta: Meta<typeof UsersDirectory> = {
  title: "Portal/Users/UsersDirectory",
  component: UsersDirectory,
  parameters: { layout: "padded" },
  args: {
    members: MEMBERS,
    teams: TEAMS,
    capabilities: FULL_CAPS,
    onChangeRole: () => {},
    onGrantProcessor: () => {},
    onRevokeProcessor: () => {},
    processorTeamIds: new Set<number>(),
    onGrantTeamProcessor: () => {},
    onRevokeTeamProcessor: () => {},
    onAddToTeam: () => {},
    onResetPassword: () => {},
    onMoveToTeam: () => {},
    onToggleEnabled: () => {},
    onUnlock: () => {},
    onDisableMfa: () => {},
    onRemove: () => {},
    onRenameTeam: () => {},
    onDeleteTeam: () => {},
    // Documents the intended "Approves policy" chip; hidden in the live app.
    showApprover: true,
  },
};
export default meta;
type Story = StoryObj<typeof UsersDirectory>;

/** Organization owner plus two teams, each with a leader. */
export const Default: Story = {};

/**
 * SaaS build (team-leader scope): no Organization group, no role select, no
 * password/suspend actions - just invite / rename / remove-from-team.
 */
export const SaasTeamLeader: Story = {
  args: {
    members: MEMBERS.filter((m) => m.role !== "admin"),
    capabilities: SAAS_CAPS,
  },
};

/** A solo workspace: just the org owner, no teams yet. */
export const OrgOnly: Story = {
  args: { members: MEMBERS.filter((m) => m.role === "admin"), teams: [] },
};

/** A team with a team-wide Processor grant: every member inherits it (solid, non-removable). */
export const TeamWideProcessor: Story = {
  args: {
    members: MEMBERS.map((m) =>
      m.teamId === 2 && m.role === "member"
        ? { ...m, portalAccess: "team" as const, portalGrantId: undefined }
        : m,
    ),
    processorTeamIds: new Set<number>([2]),
  },
};

/** One team, mixed Processor access (implicit, granted, and not granted). */
export const SingleTeam: Story = {
  args: {
    members: MEMBERS.filter((m) => m.teamId === 2 || m.role === "admin"),
    teams: TEAMS.filter((t) => t.id === 2),
  },
};

/** Guests group + "Guest" role option (parked in the live app; behind showGuests). */
export const WithGuests: Story = {
  args: { members: [...MEMBERS, GUEST], showGuests: true },
};

/** Suspended / locked / MFA-enrolled members show inline tags and gated kebab actions. */
export const MemberStates: Story = {
  args: {
    members: STATE_MEMBERS,
    teams: TEAMS.filter((t) => t.id === 2),
  },
};

/** A team past the collapse limit surfaces the "Show all" expander. */
export const LargeTeam: Story = {
  args: {
    members: BIG_MEMBERS,
    teams: [{ id: 9, name: "Platform", userCount: 11, owners: ["tm1"] }],
  },
};
