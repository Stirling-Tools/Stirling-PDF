import type { Meta, StoryObj } from "@storybook/react-vite";
import TeamDetailsSection from "@app/components/shared/config/configSections/TeamDetailsSection";
import { teamService } from "@app/services/teamService";
import { userManagementService } from "@app/services/userManagementService";

// TeamDetailsSection fetches through these services on mount rather than
// taking data as props, so the story stubs the service methods directly
// instead of passing mock data in.
teamService.getTeamDetails = async () => ({
  team: { id: 1, name: "Engineering" },
  teamUsers: [
    {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      roleName: "adminUserSettings.admin",
      rolesAsString: "ROLE_ADMIN",
      enabled: true,
    },
    {
      id: 2,
      username: "bob",
      email: "bob@example.com",
      roleName: "adminUserSettings.user",
      rolesAsString: "ROLE_USER",
      enabled: true,
    },
    {
      id: 3,
      username: "carol",
      roleName: "adminUserSettings.user",
      rolesAsString: "ROLE_USER",
      enabled: false,
    },
  ],
  availableUsers: [
    {
      id: 4,
      username: "dave",
      roleName: "adminUserSettings.user",
      rolesAsString: "ROLE_USER",
      enabled: true,
    },
  ],
  userLastRequest: { alice: Date.now() },
});

teamService.getTeams = async () => [
  { id: 1, name: "Engineering" },
  { id: 2, name: "Default" },
];

userManagementService.getUsers = async () => ({
  users: [],
  userSessions: {},
  userLastRequest: {},
  totalUsers: 4,
  activeUsers: 3,
  disabledUsers: 1,
  maxAllowedUsers: 10,
  availableSlots: 6,
  grandfatheredUserCount: 0,
  licenseMaxUsers: 10,
  premiumEnabled: true,
  mailEnabled: true,
  lockedUsers: [],
});

const meta = {
  title: "Config/TeamDetailsSection",
  component: TeamDetailsSection,
  parameters: { layout: "padded" },
  args: {
    teamId: 1,
    onBack: () => {},
  },
} satisfies Meta<typeof TeamDetailsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A team with a mix of active and disabled members. */
export const Default: Story = {};

/** A team with no members yet shows the empty-state row. */
export const Empty: Story = {
  decorators: [
    (Story) => {
      teamService.getTeamDetails = async () => ({
        team: { id: 2, name: "Design" },
        teamUsers: [],
        availableUsers: [],
        userLastRequest: {},
      });
      return <Story />;
    },
  ],
  args: { teamId: 2 },
};
