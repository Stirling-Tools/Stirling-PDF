import type { Meta, StoryObj } from "@storybook/react-vite";
import { CustomSearchLayer } from "@app/components/viewer/CustomSearchLayer";

// CustomSearchLayer reads its highlight rects from the EmbedPDF search plugin
// context (useSearch/useDocumentState). Outside a mounted PDFContext.Provider
// those hooks fall back to their default (empty) state, so the layer renders
// nothing — this still exercises the component mounting without throwing.
const meta = {
  title: "Viewer/CustomSearchLayer",
  component: CustomSearchLayer,
} satisfies Meta<typeof CustomSearchLayer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    documentId: "doc-1",
    pageIndex: 0,
    scale: 1,
    highlightColor: "rgba(255, 220, 0, 0.4)",
    activeHighlightColor: "rgba(255, 140, 0, 0.6)",
    opacity: 1,
    padding: 2,
    borderRadius: 4,
  },
};
