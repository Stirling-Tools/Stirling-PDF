import type { Meta, StoryObj } from "@storybook/react-vite";
import { agentsFor } from "@portal/mocks/agents";
import { EvalsPanel } from "@portal/components/agent-builder/EvalsPanel";

const PRO = agentsFor("pro");
const FREE = agentsFor("free");

const meta: Meta<typeof EvalsPanel> = {
  title: "Portal/AgentBuilder/EvalsPanel",
  component: EvalsPanel,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "44rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EvalsPanel>;

/** High pass-rate agent — bar and pass-rate tile read green. */
export const Passing: Story = {
  args: { agent: PRO[0] },
};

/** KYC draft sits below the green band, so the pass-rate tile warns. */
export const BelowTarget: Story = {
  args: { agent: PRO[2] },
};

/** Free-tier agent has no golden set — the panel shows the upgrade gate. */
export const NoGoldenSet: Story = {
  args: { agent: FREE[0] },
};
