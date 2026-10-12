import type { Meta, StoryObj } from "@storybook/react-vite";
import UpdateSeatsModal from "@app/components/shared/UpdateSeatsModal";

/**
 * Modal for adjusting enterprise seat count, redirecting to the Stripe billing portal on confirm.
 */
const meta = {
  title: "Shared/UpdateSeatsModal",
  component: UpdateSeatsModal,
  parameters: { layout: "fullscreen" },
  args: {
    opened: true,
    onClose: () => {},
    currentSeats: 10,
    minimumSeats: 5,
  },
} satisfies Meta<typeof UpdateSeatsModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** Minimum seats equal to current seats, e.g. a fully-utilized license. */
export const AtMinimum: Story = {
  args: {
    currentSeats: 5,
    minimumSeats: 5,
  },
};
