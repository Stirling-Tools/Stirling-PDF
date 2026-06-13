import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatFABButton } from "@shared/components/ChatFABButton";

const meta: Meta<typeof ChatFABButton> = {
  title: "Editor/ChatFAB/ChatFABButton",
  component: ChatFABButton,
  parameters: { layout: "centered" },
  argTypes: {
    isLoading: { control: "boolean" },
    showTick: { control: "boolean" },
    onClick: { action: "clicked" },
  },
};
export default meta;
type Story = StoryObj<typeof ChatFABButton>;

/** Default idle state — no agent running, no unread result. */
export const Default: Story = {};

/** Agent is actively working — the logo paths animate and a green pulse dot appears. */
export const Loading: Story = {
  args: { isLoading: true },
};

/** Agent finished while the panel was closed — tick badge pops in to signal an unread result. */
export const Tick: Story = {
  args: { showTick: true },
};

/**
 * If loading restarts while a tick is already showing, the pulse dot is
 * suppressed in favour of the tick until the user opens the panel.
 * In practice this transition is handled by the parent via `hasUnviewedResult`.
 */
export const TickWhileLoading: Story = {
  args: { isLoading: true, showTick: true },
};
