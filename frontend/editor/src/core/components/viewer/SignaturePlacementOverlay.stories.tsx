import { useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignaturePlacementOverlay } from "@app/components/viewer/SignaturePlacementOverlay";
import { SignatureProvider } from "@app/contexts/SignatureContext";
import type { SignParameters } from "@app/hooks/tools/sign/useSignParameters";

const textSignature: SignParameters = {
  signatureType: "text",
  signerName: "Jordan Blake",
  fontFamily: "Helvetica",
  fontSize: 32,
  textColor: "#1e293b",
  textAlign: "left",
};

// The overlay positions itself relative to containerRef and only paints once a
// mousemove has been observed inside that element, so the harness supplies a
// sized, positioned container and fires a synthetic mousemove after mount to
// simulate the cursor already being over the page.
function PlacementHarness({
  signatureConfig,
}: {
  signatureConfig: SignParameters | null;
}) {
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
  }, [signatureConfig]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: 480,
        height: 320,
        border: "1px dashed var(--mantine-color-gray-4)",
        background: "var(--mantine-color-gray-0)",
      }}
    >
      <SignaturePlacementOverlay
        containerRef={containerRef}
        isActive
        signatureConfig={signatureConfig}
      />
    </div>
  );
}

const meta = {
  title: "Viewer/SignaturePlacementOverlay",
  component: SignaturePlacementOverlay,
  // SignaturePlacementOverlay reads useSignature() to report its preview size
  // back up — that context isn't mounted by the shared preview, so stub it here.
  decorators: [
    (Story) => (
      <SignatureProvider>
        <Story />
      </SignatureProvider>
    ),
  ],
} satisfies Meta<typeof SignaturePlacementOverlay>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Cursor-following preview of a text signature over the page. */
export const Default: Story = {
  render: () => <PlacementHarness signatureConfig={textSignature} />,
};

/** No signature configured yet — the overlay renders nothing. */
export const NoSignatureConfigured: Story = {
  render: () => <PlacementHarness signatureConfig={null} />,
};
