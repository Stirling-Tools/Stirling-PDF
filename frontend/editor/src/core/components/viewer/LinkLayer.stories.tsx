import type { Meta, StoryObj } from "@storybook/react-vite";
import { LinkLayer } from "@app/components/viewer/LinkLayer";

// LinkLayer reads its link annotations from EmbedPDF's react context
// (useDocumentState/useScroll/useAnnotation). Outside of a live <EmbedPDF>
// provider those hooks resolve to their documented empty defaults (no
// annotations, scale 1), so the layer renders null — this still exercises
// the component's mount path without needing a real PDF engine.
const meta = {
  title: "Viewer/LinkLayer",
  component: LinkLayer,
} satisfies Meta<typeof LinkLayer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    documentId: "storybook-doc",
    pageIndex: 0,
  },
};
