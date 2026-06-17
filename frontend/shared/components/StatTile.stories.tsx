import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatTile } from "@shared/components/StatTile";

const meta: Meta<typeof StatTile> = {
  title: "Primitives/StatTile",
  component: StatTile,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { label: "Error rate", value: "0.4%", tone: "default" },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["default", "success", "warning", "danger"],
    },
  },
};
export default meta;
type Story = StoryObj<typeof StatTile>;

export const Playground: Story = {};

export const ToneRow: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 32 }}>
      <StatTile label="Uptime" value="99.98%" tone="success" />
      <StatTile label="Error rate" value="1.4%" tone="warning" />
      <StatTile label="Error rate" value="6.2%" tone="danger" />
      <StatTile label="P95 latency" value="412 ms" />
    </div>
  ),
};
