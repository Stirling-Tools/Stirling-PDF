import type { Meta, StoryObj } from "@storybook/react-vite";
import { SectionDivider } from "@shared/components/SectionDivider";

const meta: Meta<typeof SectionDivider> = {
  title: "Primitives/SectionDivider",
  component: SectionDivider,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof SectionDivider>;

export const Default: Story = {
  render: () => (
    <div style={{ width: "24rem" }}>
      <p style={{ color: "var(--color-text-3)" }}>Section above</p>
      <SectionDivider />
      <p style={{ color: "var(--color-text-3)" }}>Section below</p>
    </div>
  ),
};

export const InContext_SidebarGroups: Story = {
  render: () => (
    <div
      style={{
        width: "15rem",
        background: "var(--color-sidebar-bg)",
        padding: 10,
        border: "1px solid var(--color-sidebar-border)",
        borderRadius: 6,
        color: "var(--color-text-2)",
        fontSize: 13,
      }}
    >
      <div style={{ padding: "8px 10px" }}>Home</div>
      <SectionDivider />
      <div style={{ padding: "8px 10px" }}>Editor</div>
      <div style={{ padding: "8px 10px" }}>Sources</div>
      <div style={{ padding: "8px 10px" }}>Pipelines</div>
      <SectionDivider />
      <div style={{ padding: "8px 10px" }}>Infrastructure</div>
      <div style={{ padding: "8px 10px" }}>Usage</div>
    </div>
  ),
};
