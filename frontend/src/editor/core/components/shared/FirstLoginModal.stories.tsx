import type { Meta, StoryObj } from "@storybook/react-vite";
import FirstLoginModal from "@app/components/shared/FirstLoginModal";

const meta = {
  title: "Shared/FirstLoginModal",
  component: FirstLoginModal,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FirstLoginModal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    username: "jane.doe",
    onPasswordChanged: () => {},
  },
};
