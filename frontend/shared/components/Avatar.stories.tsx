import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "@shared/components/Avatar";

const meta: Meta<typeof Avatar> = {
  title: "Primitives/Avatar",
  component: Avatar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { name: "Harper Lee", size: "md", tone: "blue" },
  argTypes: {
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg"] },
    tone: {
      control: "inline-radio",
      options: ["blue", "purple", "green", "amber", "red", "neutral"],
    },
    onClick: { action: "clicked" },
  },
};
export default meta;
type Story = StoryObj<typeof Avatar>;

/** Flip name / size / tone / interactive in controls. */
export const Playground: Story = {};

export const SizeRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Avatar name="A B" size="xs" />
      <Avatar name="A B" size="sm" />
      <Avatar name="A B" size="md" />
      <Avatar name="A B" size="lg" />
    </div>
  ),
};

export const ToneRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      {(["blue", "purple", "green", "amber", "red", "neutral"] as const).map(
        (t) => (
          <Avatar key={t} name={t[0].toUpperCase()} tone={t} />
        ),
      )}
    </div>
  ),
};
