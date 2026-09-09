import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmModal } from "@portal/components/users/ConfirmModal";

const meta: Meta<typeof ConfirmModal> = {
  title: "Portal/Users/ConfirmModal",
  component: ConfirmModal,
  parameters: { layout: "fullscreen" },
  args: {
    open: true,
    title: "Remove member",
    body: "Permanently remove Sarah Kowalski from the organization? This cannot be undone.",
    confirmLabel: "Remove from org",
    danger: true,
    onConfirm: () => {},
    onCancel: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof ConfirmModal>;

/** Destructive confirm (red button). */
export const Danger: Story = {};

/** Neutral confirm. */
export const Neutral: Story = {
  args: {
    title: "Reset MFA",
    body: "Remove this member's MFA enrolment?",
    confirmLabel: "Reset MFA",
    danger: false,
  },
};
