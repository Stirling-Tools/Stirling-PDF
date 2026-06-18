import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AgentDetail } from "@portal/api/sources";
import { AgentPanel } from "@portal/components/sources/AgentPanel";

const meta: Meta<typeof AgentPanel> = {
  title: "Portal/Sources/AgentPanel",
  component: AgentPanel,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "48rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AgentPanel>;

const healthy: AgentDetail = {
  kind: "agent",
  model: "claude-sonnet-4.5",
  calls24h: 1342,
  errorRate: 0.004,
  confidence: 0.962,
  escalations24h: 11,
  assignedPipelines: ["Invoice v3", "AP Routing"],
  scopes: ["documents:read", "pipelines:invoke", "extract:write"],
};

export const Healthy: Story = { args: { d: healthy } };

/** Error rate over the 5% alarm threshold flips the badge and bar to danger/amber. */
export const Degraded: Story = {
  args: {
    d: {
      ...healthy,
      model: "claude-opus-4.1",
      errorRate: 0.071,
      confidence: 0.883,
      escalations24h: 34,
    },
  },
};
