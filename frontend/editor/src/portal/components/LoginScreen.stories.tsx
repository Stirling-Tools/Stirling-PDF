import type { Meta, StoryObj } from "@storybook/react-vite";
import { LoginScreen } from "@portal/components/LoginScreen";

const meta: Meta<typeof LoginScreen> = {
  title: "Portal/LoginScreen",
  component: LoginScreen,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof LoginScreen>;

export const Default: Story = {};
