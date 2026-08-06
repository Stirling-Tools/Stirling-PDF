import type { Meta, StoryObj } from "@storybook/react-vite";
import { ImageTool } from "@editor/components/annotation/tools/ImageTool";
import { SignatureProvider } from "@editor/contexts/SignatureContext";
import { PDFAnnotationProvider } from "@editor/components/annotation/providers/PDFAnnotationProvider";

// ImageTool renders BaseAnnotationTool, which reads both SignatureContext and
// PDFAnnotationContext — neither is mounted by the shared preview, so stub both
// here with no-op handlers.
const meta = {
  title: "Annotation/ImageTool",
  component: ImageTool,
  decorators: [
    (Story) => (
      <SignatureProvider>
        <PDFAnnotationProvider
          activateDrawMode={() => {}}
          deactivateDrawMode={() => {}}
          activateSignaturePlacementMode={() => {}}
          activateDeleteMode={() => {}}
          updateDrawSettings={() => {}}
          undo={() => {}}
          redo={() => {}}
          storeImageData={() => {}}
          getImageData={() => undefined}
          isPlacementMode={false}
          signatureConfig={null}
          setSignatureConfig={() => {}}
        >
          <Story />
        </PDFAnnotationProvider>
      </SignatureProvider>
    ),
  ],
} satisfies Meta<typeof ImageTool>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onImageChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    onImageChange: () => {},
    disabled: true,
  },
};
