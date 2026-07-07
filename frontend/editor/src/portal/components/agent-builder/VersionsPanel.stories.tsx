import type { Meta, StoryObj } from "@storybook/react-vite";
import { agentsFor } from "@portal/mocks/agents";
import { VersionsPanel } from "@portal/components/agent-builder/VersionsPanel";

const PRO = agentsFor("pro");

const meta: Meta<typeof VersionsPanel> = {
  title: "Portal/AgentBuilder/VersionsPanel",
  component: VersionsPanel,
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
type Story = StoryObj<typeof VersionsPanel>;

/** Full history with rollback on prior published versions. */
export const FullHistory: Story = {
  args: { agent: PRO[0], historyUnlocked: true },
};

/** A draft current version offers a publish action. */
export const DraftAwaitingPublish: Story = {
  args: { agent: PRO[2], historyUnlocked: true },
};

/** History locked: only the current version shows, with an upgrade hint. */
export const HistoryLocked: Story = {
  args: { agent: PRO[0], historyUnlocked: false },
};
