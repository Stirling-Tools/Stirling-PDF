import type { Meta, StoryObj } from "@storybook/react-vite";
import { TeamWelcomeBanner } from "@editor/components/shared/TeamWelcomeBanner";
import {
  markTeamWelcome,
  resetTeamWelcomeForTests,
} from "@editor/billing/teamWelcome";

/**
 * Shown once in the editor after a Team purchase. It only renders while a fresh purchase mark is
 * waiting, so each story leaves one before rendering.
 */
const meta = {
  title: "Shared/TeamWelcomeBanner",
  component: TeamWelcomeBanner,
  parameters: { layout: "fullscreen" },
  beforeEach: () => {
    resetTeamWelcomeForTests();
    markTeamWelcome();
  },
} satisfies Meta<typeof TeamWelcomeBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const JustBoughtTeam: Story = {};
