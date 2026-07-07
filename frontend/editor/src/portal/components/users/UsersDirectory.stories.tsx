import type { Meta, StoryObj } from "@storybook/react-vite";
import { UsersDirectory } from "@portal/components/users/UsersDirectory";
import type { Member } from "@portal/api/users";
import type { Team } from "@portal/api/teams";

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
    lastActive: "Yesterday",
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
    onChangeRole: () => {},
    onGrantProcessor: () => {},
    onRevokeProcessor: () => {},
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

/** Organization owner, two teams with leaders, and a guest. */
export const Default: Story = {};

/** A solo workspace: just the org owner, no teams or guests yet. */
export const OrgOnly: Story = {
  args: { members: MEMBERS.filter((m) => m.role === "admin"), teams: [] },
};

/** One team, mixed Processor access (implicit, granted, and not granted). */
export const SingleTeam: Story = {
  args: {
    members: MEMBERS.filter((m) => m.teamId === 2 || m.role === "admin"),
    teams: TEAMS.filter((t) => t.id === 2),
  },
};
