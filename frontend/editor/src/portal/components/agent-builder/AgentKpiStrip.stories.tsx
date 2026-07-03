import type { Meta, StoryObj } from "@storybook/react-vite";
import { buildAgentsResponse } from "@portal/mocks/agents";
import { AgentKpiStrip } from "@portal/components/agent-builder/AgentKpiStrip";

const meta: Meta<typeof AgentKpiStrip> = {
  title: "Portal/AgentBuilder/AgentKpiStrip",
  component: AgentKpiStrip,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof AgentKpiStrip>;

export const Pro: Story = {
  args: { summary: buildAgentsResponse("pro").summary, loading: false },
};

export const Enterprise: Story = {
  args: { summary: buildAgentsResponse("enterprise").summary, loading: false },
};

export const Loading: Story = {
  args: { summary: null, loading: true },
};
