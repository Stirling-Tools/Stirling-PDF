import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "@app/ui/StatusBadge";

const meta: Meta<typeof StatusBadge> = {
  title: "Primitives/StatusBadge",
  component: StatusBadge,
  parameters: { layout: "centered" },
  args: { children: "Healthy", tone: "success" },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["neutral", "success", "warning", "danger", "info", "purple"],
    },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    variant: { control: "inline-radio", options: ["pill", "subtle"] },
  },
};
export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Default: Story = {};

export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <StatusBadge tone="success">Processed</StatusBadge>
      <StatusBadge tone="warning">Needs review</StatusBadge>
      <StatusBadge tone="danger">Escalated</StatusBadge>
      <StatusBadge tone="info">In review</StatusBadge>
      <StatusBadge tone="purple">Resolved</StatusBadge>
      <StatusBadge tone="neutral">Paused</StatusBadge>
    </div>
  ),
};

export const Live: Story = {
  args: { tone: "success", pulse: true, children: "Live" },
};

/** Toned-down table-cell treatment: the dot carries the tone, the label stays quiet. */
export const Subtle: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <StatusBadge variant="subtle" tone="success" size="sm">
        Active
      </StatusBadge>
      <StatusBadge variant="subtle" tone="warning" size="sm">
        Needs review
      </StatusBadge>
      <StatusBadge variant="subtle" tone="neutral" size="sm">
        Idle
      </StatusBadge>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <StatusBadge tone="info" size="sm">
        Small
      </StatusBadge>
      <StatusBadge tone="info" size="md">
        Medium
      </StatusBadge>
      <StatusBadge tone="info" size="lg">
        Large
      </StatusBadge>
    </div>
  ),
};
