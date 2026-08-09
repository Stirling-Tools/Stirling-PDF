/**
 * Marks a tool as running against the cloud backend rather than the bundled
 * local one. Icon-only by design — the meaning lives in the tooltip.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudBadge } from "@app/components/shared/CloudBadge";

const meta: Meta<typeof CloudBadge> = {
  title: "Desktop/CloudBadge",
  component: CloudBadge,
  parameters: { layout: "centered" },
};
export default meta;

type Story = StoryObj<typeof CloudBadge>;

export const Default: Story = {};

/** Sat beside a tool name, which is where it actually appears. */
export const BesideLabel: Story = {
  render: () => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      Convert to PDF/A
      <CloudBadge />
    </span>
  ),
};
