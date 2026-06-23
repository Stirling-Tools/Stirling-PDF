import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { agentsFor } from "@portal/mocks/agents";
import { AgentSelector } from "@portal/components/agent-builder/AgentSelector";

const AGENTS = agentsFor("enterprise");

const meta: Meta<typeof AgentSelector> = {
  title: "Portal/AgentBuilder/AgentSelector",
  component: AgentSelector,
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "18rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AgentSelector>;

export const Default: Story = {
  args: { agents: AGENTS, selectedId: AGENTS[0].id, onSelect: () => {} },
};

/** Clicking a row moves the selection — drives which builder is shown. */
export const Interactive: Story = {
  render: () => {
    const [id, setId] = useState(AGENTS[0].id);
    return <AgentSelector agents={AGENTS} selectedId={id} onSelect={setId} />;
  },
};
