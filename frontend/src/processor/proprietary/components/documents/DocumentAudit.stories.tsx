import type { Meta, StoryObj } from "@storybook/react-vite";
import { documentsFor } from "@processor/mocks/documents";
import { DocumentAudit } from "@processor/components/documents/DocumentAudit";
import "@processor/views/Documents.css";

const DOC = documentsFor("pro")[0];

const meta: Meta<typeof DocumentAudit> = {
  title: "Portal/Documents/DocumentAudit",
  component: DocumentAudit,
  parameters: { layout: "padded" },
  args: { doc: DOC },
  decorators: [
    (S) => (
      <div style={{ maxWidth: "36rem" }}>
        <S />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DocumentAudit>;

export const Default: Story = {};

/** A document whose lifecycle reached approval. */
export const Approved: Story = {
  args: { doc: documentsFor("pro").find((d) => d.status === "processed")! },
};
