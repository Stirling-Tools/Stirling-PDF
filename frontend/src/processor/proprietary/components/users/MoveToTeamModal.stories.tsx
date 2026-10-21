import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoveToTeamModal } from "@portal/components/users/MoveToTeamModal";
import type { Member } from "@portal/api/users";
import type { Team } from "@portal/api/teams";

const MEMBER: Member = {
  id: "3",
  name: "Sarah Kowalski",
  email: "sarah@stirlingpdf.com",
  role: "member",
  status: "active",
  lastActive: "30m ago",
  username: "sarah",
  teamId: 2,
};

const TEAMS: Team[] = [
  { id: 1, name: "Default", userCount: 4, owners: [] },
  { id: 2, name: "Engineering", userCount: 3, owners: ["tom"] },
  { id: 3, name: "Compliance", userCount: 2, owners: ["dana"] },
];

const meta: Meta<typeof MoveToTeamModal> = {
  title: "Portal/Users/MoveToTeamModal",
  component: MoveToTeamModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    member: MEMBER,
    teams: TEAMS,
    onClose: () => {},
    onDone: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof MoveToTeamModal>;

export const Default: Story = {};
