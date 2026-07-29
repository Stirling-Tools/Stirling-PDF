import type { Meta, StoryObj } from "@storybook/react-vite";
import { BulkReviewConfirmModal } from "@portal/components/review/BulkReviewConfirmModal";

const meta: Meta<typeof BulkReviewConfirmModal> = {
  title: "Portal/Review/BulkReviewConfirmModal",
  component: BulkReviewConfirmModal,
  parameters: { layout: "fullscreen" },
  args: {
    count: 42,
    destinations: ["Amazon S3 · processed/"],
    busy: false,
    onCancel: () => {},
    onConfirm: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof BulkReviewConfirmModal>;

export const ApproveAll: Story = { args: { decision: "approve" } };

export const RejectAll: Story = { args: { decision: "reject" } };

export const MixedDestinations: Story = {
  args: {
    decision: "approve",
    count: 7,
    destinations: ["Amazon S3 · processed/", "Folder · /srv/out"],
  },
};

export const Working: Story = {
  args: { decision: "reject", busy: true },
};
