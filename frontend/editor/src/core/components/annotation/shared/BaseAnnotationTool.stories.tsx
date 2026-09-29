import type { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BaseAnnotationTool } from "@app/components/annotation/shared/BaseAnnotationTool";
import { PDFAnnotationProvider } from "@app/components/annotation/providers/PDFAnnotationProvider";
import { SignatureProvider } from "@app/contexts/SignatureContext";

// BaseAnnotationTool reads usePDFAnnotation()/useSignature() for undo/redo and
// placement wiring — stub both providers so the story can mount standalone.
const StoryProviders = ({ children }: { children: ReactNode }) => (
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
      {children}
    </PDFAnnotationProvider>
  </SignatureProvider>
);

// BaseAnnotationTool clones its child with tool-specific props (selectedColor,
// signatureData, onSignatureDataChange, onColorSwatchClick, disabled) — a real
// tool component absorbs these; a bare DOM element would just log prop warnings.
const ToolContent = (_props: Record<string, unknown>) => (
  <div>Tool content</div>
);

const meta = {
  title: "Annotation/BaseAnnotationTool",
  component: BaseAnnotationTool,
  decorators: [
    (Story) => (
      <StoryProviders>
        <Story />
      </StoryProviders>
    ),
  ],
} satisfies Meta<typeof BaseAnnotationTool>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    config: {
      enableImageUpload: true,
      showPlaceButton: true,
      placeButtonText: "Place Image",
    },
    children: <ToolContent />,
  },
};

export const Disabled: Story = {
  args: {
    ...Default.args,
    disabled: true,
  },
};
