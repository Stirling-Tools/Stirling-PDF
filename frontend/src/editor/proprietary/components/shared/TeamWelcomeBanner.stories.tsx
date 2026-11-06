import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TeamWelcomeBanner } from "@editor/components/shared/TeamWelcomeBanner";
import { TEAM_WELCOME_STATE } from "@editor/billing/teamWelcome";

/** Arrives at the editor the way billing sends a buyer after a Team purchase. */
function ArriveFromPurchase() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/editor", { state: TEAM_WELCOME_STATE });
  }, [navigate]);
  return null;
}

/** Shown once in the editor after a Team purchase. */
const meta = {
  title: "Shared/TeamWelcomeBanner",
  component: TeamWelcomeBanner,
  parameters: { layout: "fullscreen" },
  render: () => (
    <>
      <ArriveFromPurchase />
      <TeamWelcomeBanner />
    </>
  ),
} satisfies Meta<typeof TeamWelcomeBanner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const JustBoughtTeam: Story = {};
