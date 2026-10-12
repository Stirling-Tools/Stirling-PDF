import type { Meta, StoryObj } from "@storybook/react-vite";
import { SignaturePreviewLayer } from "@app/components/viewer/SignaturePreviewLayer";
import type { SignaturePreview } from "@app/components/viewer/viewerTypes";

// A 1x1 transparent PNG — enough to satisfy the <img> src without a real signature asset.
const PLACEHOLDER_SIGNATURE_DATA =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const SAMPLE_PREVIEWS: SignaturePreview[] = [
  {
    id: "sig-1",
    pageIndex: 0,
    x: 0.2,
    y: 0.6,
    width: 0.25,
    height: 0.1,
    signatureData: PLACEHOLDER_SIGNATURE_DATA,
    signatureType: "image",
    participantName: "Jane Doe",
  },
];

// SignaturePreviewLayer reads pause/resume from EmbedPDF's interaction-manager
// react context (useInteractionManagerCapability). Outside a mounted PDFContext
// provider that hook resolves to its documented empty default (no capability),
// so drag/resize handlers no-op — this still exercises the component's mount
// and render path without needing a real PDF engine.
const meta = {
  title: "Viewer/SignaturePreviewLayer",
  component: SignaturePreviewLayer,
} satisfies Meta<typeof SignaturePreviewLayer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    pageIndex: 0,
    pageWidth: 600,
    pageHeight: 800,
    previews: SAMPLE_PREVIEWS,
    readOnly: false,
    placementMode: false,
    onChange: () => {},
  },
};

export const ReadOnly: Story = {
  args: {
    ...Default.args,
    readOnly: true,
  },
};

export const PlacementMode: Story = {
  args: {
    ...Default.args,
    previews: [],
    placementMode: true,
    placementData: PLACEHOLDER_SIGNATURE_DATA,
    placementType: "image",
  },
};
