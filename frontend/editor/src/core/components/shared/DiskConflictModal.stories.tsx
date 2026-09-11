import type { Meta, StoryObj } from "@storybook/react-vite";
import { DiskConflictModal } from "@app/components/shared/DiskConflictModal";

/** The queued variant matters as much as the single one: a watcher burst can
 *  raise several at once, and the count is the only cue that more follow. */
const meta: Meta<typeof DiskConflictModal> = {
  title: "Shared/DiskConflictModal",
  component: DiskConflictModal,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    opened: true,
    fileName: "quarterly-report.pdf",
    remainingCount: 0,
  },
};

export const MoreQueued: Story = {
  args: {
    opened: true,
    fileName: "quarterly-report.pdf",
    remainingCount: 2,
  },
};

export const LongFileName: Story = {
  args: {
    opened: true,
    fileName:
      "2026-q3-consolidated-financial-statements-and-appendices-final-v7.pdf",
    remainingCount: 0,
  },
};
