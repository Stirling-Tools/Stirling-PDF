import type { Meta, StoryObj } from "@storybook/react-vite";
import { documentsFor } from "@processor/mocks/documents";
import { DocumentOverview } from "@processor/components/documents/DocumentOverview";
import "@processor/views/Documents.css";

const DOC = documentsFor("pro")[0];

const meta: Meta<typeof DocumentOverview> = {
  title: "Portal/Documents/DocumentOverview",
  component: DocumentOverview,
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
type Story = StoryObj<typeof DocumentOverview>;

export const Default: Story = {};
