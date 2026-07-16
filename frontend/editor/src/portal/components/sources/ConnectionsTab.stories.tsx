import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionsTab } from "@portal/components/sources/ConnectionsTab";

const meta = {
  title: "Portal/Sources/ConnectionsTab",
  component: ConnectionsTab,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ConnectionsTab>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
