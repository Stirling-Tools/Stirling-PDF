import type { Meta, StoryObj } from "@storybook/react-vite";
import { agentsFor } from "@portal/mocks/agents";
import { ScenariosPanel } from "@portal/components/agent-builder/ScenariosPanel";

const AGENTS = agentsFor("pro");

const meta: Meta<typeof ScenariosPanel> = {
  title: "Portal/AgentBuilder/ScenariosPanel",
  component: ScenariosPanel,
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
type Story = StoryObj<typeof ScenariosPanel>;

/** Contract Router ships three scenarios; the add-row stages a fourth locally. */
export const Default: Story = {
  args: { agent: AGENTS[0] },
};

/** An agent with a muted scenario (excluded from the eval run). */
export const WithMutedScenario: Story = {
  args: { agent: AGENTS[1] },
};
