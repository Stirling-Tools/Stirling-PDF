import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoTooltip } from "@app/ui/InfoTooltip";

const meta: Meta<typeof InfoTooltip> = {
  title: "Primitives/InfoTooltip",
  component: InfoTooltip,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: {
    label: "The folder (key prefix) within the bucket to watch.",
    position: "top",
  },
};
export default meta;
type Story = StoryObj<typeof InfoTooltip>;

/** Hover or focus the (i) to reveal the explanation. */
export const Default: Story = {};

/** Inline beside a label, the way FormField renders it. */
export const BesideLabel: Story = {
  render: (args) => (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
    >
      <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Folder</span>
      <InfoTooltip {...args} />
    </span>
  ),
};
