import type { Meta, StoryObj } from "@storybook/react-vite";
import { DrawingTool } from "@app/components/annotation/tools/DrawingTool";
import { SignatureProvider } from "@app/contexts/SignatureContext";
import { PDFAnnotationProvider } from "@app/components/annotation/providers/PDFAnnotationProvider";

// DrawingTool renders BaseAnnotationTool, which reads both SignatureContext and
// PDFAnnotationContext — neither is mounted by the shared preview, so stub both
// here with no-op handlers.
const meta = {
  title: "Annotation/DrawingTool",
  component: DrawingTool,
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
} satisfies Meta<typeof DrawingTool>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onDrawingChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    onDrawingChange: () => {},
    disabled: true,
  },
};
