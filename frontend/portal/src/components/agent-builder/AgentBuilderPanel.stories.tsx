import type { Meta, StoryObj } from "@storybook/react-vite";
import { agentsFor } from "@portal/mocks/agents";
import { AgentBuilderPanel } from "@portal/components/agent-builder/AgentBuilderPanel";

const PRO = agentsFor("pro");

const meta: Meta<typeof AgentBuilderPanel> = {
  title: "Portal/AgentBuilder/AgentBuilderPanel",
  component: AgentBuilderPanel,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "52rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AgentBuilderPanel>;

/** Published agent with enterprise governance unlocked. */
export const Published: Story = {
  args: { agent: PRO[0], governanceUnlocked: true },
};

/** Draft agent with governance locked (pro/free posture). */
export const DraftLocked: Story = {
  args: { agent: PRO[2], governanceUnlocked: false },
};
