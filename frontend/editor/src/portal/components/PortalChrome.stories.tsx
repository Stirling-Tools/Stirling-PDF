import type { Meta, StoryObj } from "@storybook/react-vite";
import { PortalChrome } from "@portal/components/PortalChrome";

const meta = {
  title: "Portal/Shell/PortalChrome",
  component: PortalChrome,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof PortalChrome>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
