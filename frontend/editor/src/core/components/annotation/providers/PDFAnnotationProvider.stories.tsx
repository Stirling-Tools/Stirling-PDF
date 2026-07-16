import type { Meta, StoryObj } from "@storybook/react-vite";
import { PDFAnnotationProvider } from "@app/components/annotation/providers/PDFAnnotationProvider";

const meta = {
  title: "Annotation/Providers/PDFAnnotationProvider",
  component: PDFAnnotationProvider,
} satisfies Meta<typeof PDFAnnotationProvider>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <div>Annotation content</div>,
    activateDrawMode: () => {},
    deactivateDrawMode: () => {},
    activateSignaturePlacementMode: () => {},
    activateDeleteMode: () => {},
    updateDrawSettings: () => {},
    undo: () => {},
    redo: () => {},
    storeImageData: () => {},
    getImageData: () => undefined,
    isPlacementMode: false,
    signatureConfig: null,
    setSignatureConfig: () => {},
  },
};
