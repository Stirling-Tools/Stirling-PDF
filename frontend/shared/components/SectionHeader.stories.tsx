import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionHeader } from "@shared/components/SectionHeader";

const meta: Meta<typeof SectionHeader> = {
  title: "Primitives/SectionHeader",
  component: SectionHeader,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "20rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SectionHeader>;

export const Static: Story = { args: { title: "Policies", count: "3 active" } };

export const Collapsible: Story = {
  render: () => {
    const [open, setOpen] = useState(true);
    return (
      <SectionHeader
        title="Policies"
        count="3 active"
        collapsible
        expanded={open}
        onToggle={() => setOpen((v) => !v)}
      />
    );
  },
};
