import type { Meta, StoryObj } from "@storybook/react-vite";
import SignatureFieldOverlay from "@app/components/viewer/SignatureFieldOverlay";

// With no pdfSource the overlay resolves zero fields and renders null — this
// is the state it's mounted in until the host viewer has a document loaded.
const meta = {
  title: "Viewer/SignatureFieldOverlay",
  component: SignatureFieldOverlay,
} satisfies Meta<typeof SignatureFieldOverlay>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    pageIndex: 0,
    pdfSource: null,
    documentId: "doc-1",
    pageWidth: 612,
    pageHeight: 792,
  },
};
