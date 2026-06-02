import type { Meta, StoryObj } from "@storybook/react-vite";
import { Inline } from "@shared/components/Inline";
import { Button } from "@shared/components/Button";
import { StatusBadge } from "@shared/components/StatusBadge";

const meta: Meta<typeof Inline> = {
  title: "Primitives/Layout/Inline",
  component: Inline,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof Inline>;

export const Default: Story = {
  render: () => (
    <Inline gap="2">
      <Button variant="gradient">Primary</Button>
      <Button variant="outline">Secondary</Button>
      <Button variant="ghost">Cancel</Button>
    </Inline>
  ),
};

export const SpaceBetween: Story = {
  render: () => (
    <Inline
      justify="between"
      style={{
        width: "30rem",
        padding: 12,
        border: "1px solid var(--color-border)",
        borderRadius: 8,
      }}
    >
      <span>Pipeline name</span>
      <StatusBadge tone="success" pulse>
        healthy
      </StatusBadge>
    </Inline>
  ),
};

export const Wrap: Story = {
  render: () => (
    <Inline gap="1" style={{ maxWidth: "20rem" }}>
      {Array.from({ length: 12 }).map((_, i) => (
        <StatusBadge key={i} tone="info" size="sm">
          chip-{i + 1}
        </StatusBadge>
      ))}
    </Inline>
  ),
};
