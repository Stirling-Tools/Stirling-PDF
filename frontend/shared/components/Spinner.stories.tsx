import type { Meta, StoryObj } from "@storybook/react-vite";
import { Spinner } from "@shared/components/Spinner";

const meta: Meta<typeof Spinner> = {
  title: "Primitives/Spinner",
  component: Spinner,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { size: "md" },
  argTypes: {
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg"] },
  },
};
export default meta;
type Story = StoryObj<typeof Spinner>;

/** Flip size in controls. */
export const Playground: Story = {};

export const SizeRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
      <Spinner size="xs" />
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};

export const InheritsColor: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 24 }}>
      <span style={{ color: "var(--color-blue)" }}>
        <Spinner />
      </span>
      <span style={{ color: "var(--color-green)" }}>
        <Spinner />
      </span>
      <span style={{ color: "var(--color-red)" }}>
        <Spinner />
      </span>
    </div>
  ),
};
