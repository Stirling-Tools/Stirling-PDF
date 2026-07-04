import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectWizard } from "@portal/components/sources/ConnectWizard";

const meta: Meta<typeof ConnectWizard> = {
  title: "Portal/Sources/ConnectWizard",
  component: ConnectWizard,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: () => {}, onCreated: () => {} },
};
export default meta;
type Story = StoryObj<typeof ConnectWizard>;

/** Opens on the type-picker step; Continue/Back walk through the three steps. */
export const Open: Story = {};

export const Closed: Story = { args: { open: false } };
