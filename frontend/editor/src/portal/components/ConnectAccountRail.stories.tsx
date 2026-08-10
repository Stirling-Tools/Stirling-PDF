import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectAccountRail } from "@portal/components/ConnectAccountRail";

const meta: Meta<typeof ConnectAccountRail> = {
  title: "Portal/AccountLink/ConnectAccountRail",
  component: ConnectAccountRail,
};
export default meta;
type Story = StoryObj<typeof ConnectAccountRail>;

/**
 * The rail renders only where the instance can link but has not, which it reads from the backend
 * app-config. Storybook has no handler for that, so this shows the hidden state: an empty frame
 * here is the component working, not a broken story.
 */
export const Default: Story = {};
