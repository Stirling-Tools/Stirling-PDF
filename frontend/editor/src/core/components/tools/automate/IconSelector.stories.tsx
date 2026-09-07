import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import IconSelector from "@app/components/tools/automate/IconSelector";

const meta = {
  title: "Automate/IconSelector",
  component: IconSelector,
  parameters: { layout: "padded" },
} satisfies Meta<typeof IconSelector>;
export default meta;
type Story = StoryObj<typeof meta>;

function IconSelectorDemo({ size }: { size?: "sm" | "md" | "lg" }) {
  const [value, setValue] = useState("SettingsIcon");
  return <IconSelector value={value} onChange={setValue} size={size} />;
}

export const Default: Story = {
  render: () => <IconSelectorDemo />,
};

export const Medium: Story = {
  render: () => <IconSelectorDemo size="md" />,
};

export const Large: Story = {
  render: () => <IconSelectorDemo size="lg" />,
};
