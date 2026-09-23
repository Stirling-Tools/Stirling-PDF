import type { Meta, StoryObj } from "@storybook/react-vite";
import TeamsSection from "@app/components/shared/config/configSections/TeamsSection";
import { teamService } from "@app/services/teamService";
import { AppConfigProvider } from "@app/contexts/AppConfigContext";

// Fetches through teamService on mount rather than taking data as props, so
// the story stubs it directly (the module exports a plain object, so this is
// the same seam the component itself calls through).
teamService.getTeams = async () => [
  { id: 1, name: "Internal", userCount: 1 },
  { id: 2, name: "Engineering", userCount: 8 },
  { id: 3, name: "Marketing", userCount: 3 },
  {
    id: 4,
    name: "Customer Success and Onboarding Specialists",
    userCount: 5,
  },
];

/**
 * Admin panel for creating teams, renaming them, and moving members between
 * them.
 */
const meta = {
  title: "Config/ConfigSections/TeamsSection",
  component: TeamsSection,
  decorators: [
    (Story) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin: true }}
      >
        <Story />
      </AppConfigProvider>
    ),
  ],
} satisfies Meta<typeof TeamsSection>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A handful of teams, including the non-deletable "Internal" system team. */
export const Default: Story = {};

/** No teams returned yet — shows the "no teams found" empty state row. */
export const Empty: Story = {
  decorators: [
    (Story) => {
      teamService.getTeams = async () => [];
      return <Story />;
    },
  ],
};

/**
 * Login disabled — falls back to hardcoded example teams and shows the
 * login-required banner, with every row action disabled.
 */
export const LoginDisabled: Story = {
  decorators: [
    (Story) => (
      <AppConfigProvider
        autoFetch={false}
        bootstrapMode="non-blocking"
        initialConfig={{ enableLogin: false }}
      >
        <Story />
      </AppConfigProvider>
    ),
  ],
};
