import type { Meta, StoryObj } from "@storybook/react-vite";
import RefreshModal from "@app/components/shared/config/configSections/apiKeys/RefreshModal";

/**
 * Confirmation modal shown before regenerating API keys, warning that
 * existing keys will be invalidated.
 */
const meta: Meta<typeof RefreshModal> = {
  title: "Config/ApiKeys/RefreshModal",
  component: RefreshModal,
  args: {
    opened: true,
    onClose: () => {},
    onConfirm: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** When `opened` is false the modal renders nothing. */
export const Closed: Story = {
  args: { opened: false },
};
