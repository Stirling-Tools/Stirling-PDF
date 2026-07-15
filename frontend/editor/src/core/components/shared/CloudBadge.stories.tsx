import type { Meta, StoryObj } from "@storybook/react-vite";
import { CloudBadge } from "@app/components/shared/CloudBadge";

/** Web-build stub: renders nothing (cloud routing is desktop-only). */
const meta: Meta<typeof CloudBadge> = {
  title: "Shared/CloudBadge",
  component: CloudBadge,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
