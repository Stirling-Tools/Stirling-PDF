import { useEffect, useRef } from "react";
import type { Meta, StoryObj, Decorator } from "@storybook/react-vite";
import { StampPlacementOverlay } from "@app/components/viewer/StampPlacementOverlay";
import { SignatureProvider } from "@app/contexts/SignatureContext";
import type { SignParameters } from "@app/hooks/tools/sign/useSignParameters";

// StampPlacementOverlay reads/writes SignatureContext (useSignature, for
// placementPreviewSize), which isn't mounted by the shared preview.
const withProviders: Decorator = (Story) => (
  <SignatureProvider>
    <Story />
  </SignatureProvider>
);

const textSignature: SignParameters = {
  signatureType: "text",
  signerName: "Jane Doe",
  fontFamily: "Helvetica",
  fontSize: 32,
  textColor: "#1e3a5f",
  textAlign: "left",
};

// StampPlacementOverlay tracks the mouse over containerRef and only renders a
// preview once it has both a built signature image and a cursor position, so
// the demo dispatches a synthetic mousemove after mount to show it in place.
function StampPlacementOverlayDemo(
  props: Partial<React.ComponentProps<typeof StampPlacementOverlay>>,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent("mousemove", {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
      }),
    );
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: 400,
        height: 500,
        background: "#e0e0e0",
      }}
    >
      <StampPlacementOverlay
        containerRef={containerRef}
        isActive
        signatureConfig={textSignature}
        {...props}
      />
    </div>
  );
}

const meta = {
  title: "Viewer/StampPlacementOverlay",
  component: StampPlacementOverlay,
  parameters: { layout: "padded" },
  decorators: [withProviders],
} satisfies Meta<typeof StampPlacementOverlay>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Active placement mode with a text signature preview following the cursor. */
export const Default: Story = {
  render: () => <StampPlacementOverlayDemo />,
};

/** Inactive placement mode — the overlay renders nothing (returns null). */
export const Inactive: Story = {
  render: () => <StampPlacementOverlayDemo isActive={false} />,
};

/** No signature configured yet — nothing to preview, so it renders nothing. */
export const NoSignatureConfig: Story = {
  render: () => <StampPlacementOverlayDemo signatureConfig={null} />,
};
