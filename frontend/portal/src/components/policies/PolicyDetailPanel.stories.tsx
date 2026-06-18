import type { Meta, StoryObj } from "@storybook/react-vite";
import { decorateForStory } from "@portal/components/policies/storyFixtures";
import { PolicyDetailPanel } from "@portal/components/policies/PolicyDetailPanel";

const meta: Meta<typeof PolicyDetailPanel> = {
  title: "Portal/Policies/PolicyDetailPanel",
  component: PolicyDetailPanel,
  parameters: { layout: "fullscreen" },
  args: {
    onClose: () => {},
    onEdit: () => {},
    onRun: () => {},
    onTogglePause: () => {},
    onDelete: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PolicyDetailPanel>;

/** An active built-in policy — Delete is hidden (default policies aren't deletable). */
export const Active: Story = {
  args: { policy: decorateForStory("security") },
};

/** A paused policy — the action reads "Resume". */
export const Paused: Story = {
  args: {
    policy: {
      ...decorateForStory("security"),
      state: { ...decorateForStory("security").state, status: "paused" },
    },
  },
};

/** A custom (deletable) policy with no runs yet — empty activity feed. */
export const CustomNoActivity: Story = {
  args: {
    policy: {
      ...decorateForStory("security"),
      state: { ...decorateForStory("security").state, isDefault: false },
      activity: [],
      stats: { enforced: 0, dataProcessed: "0 B", activeFor: "—" },
    },
  },
};
