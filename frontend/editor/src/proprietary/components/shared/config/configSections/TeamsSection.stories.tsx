import type { Meta, StoryObj } from "@storybook/react-vite";
import TeamsSection from "@app/components/shared/config/configSections/TeamsSection";

/**
 * Admin panel for creating teams, renaming them, and moving members between
 * them. No backend is mocked for the team list here, so it renders the
 * "no teams found" empty state after the initial fetch fails.
 */
const meta: Meta<typeof TeamsSection> = {
  title: "Config/ConfigSections/TeamsSection",
  component: TeamsSection,
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
