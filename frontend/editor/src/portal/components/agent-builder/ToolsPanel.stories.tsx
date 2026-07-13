import type { Meta, StoryObj } from "@storybook/react-vite";
import { agentsFor } from "@portal/mocks/agents";
import { ToolsPanel } from "@portal/components/agent-builder/ToolsPanel";

const AGENTS = agentsFor("enterprise");

const meta: Meta<typeof ToolsPanel> = {
  title: "Portal/AgentBuilder/ToolsPanel",
  component: ToolsPanel,
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
type Story = StoryObj<typeof ToolsPanel>;

/** Restricted mode with a deny list — the enterprise governance posture. */
export const Restricted: Story = {
  args: { agent: AGENTS[0], governanceUnlocked: true },
};

/** Broad access — every tool callable. */
export const Broad: Story = {
  args: { agent: AGENTS[1], governanceUnlocked: true },
};

/** Governance locked: the toggle is disabled and explains the upgrade. */
export const GovernanceLocked: Story = {
  args: { agent: AGENTS[0], governanceUnlocked: false },
};
