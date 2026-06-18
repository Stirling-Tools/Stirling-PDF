import type { Meta, StoryObj } from "@storybook/react-vite";
import { documentsFor } from "@portal/mocks/documents";
import { ReviewQueueTable } from "@portal/components/documents/ReviewQueueTable";
import "@portal/views/Documents.css";

const DOCS = documentsFor("enterprise");

const meta: Meta<typeof ReviewQueueTable> = {
  title: "Portal/Documents/ReviewQueueTable",
  component: ReviewQueueTable,
  parameters: { layout: "padded" },
  args: { documents: DOCS, onRowClick: () => {} },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "78rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ReviewQueueTable>;

export const Default: Story = {};

/** Only the rows demanding a decision. */
export const NeedsReview: Story = {
  args: {
    documents: DOCS.filter(
      (d) => d.status === "needs-review" || d.status === "flagged",
    ),
  },
};

export const Empty: Story = {
  args: { documents: [] },
};
