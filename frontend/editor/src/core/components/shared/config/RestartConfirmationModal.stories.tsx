import type { Meta, StoryObj } from "@storybook/react-vite";
import RestartConfirmationModal from "@app/components/shared/config/RestartConfirmationModal";

const meta = {
  title: "Shared/Config/RestartConfirmationModal",
  component: RestartConfirmationModal,
  parameters: { layout: "padded" },
} satisfies Meta<typeof RestartConfirmationModal>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    onClose: () => {},
    onRestart: () => {},
  },
};

export const Closed: Story = {
  args: {
    opened: false,
    onClose: () => {},
    onRestart: () => {},
  },
};
