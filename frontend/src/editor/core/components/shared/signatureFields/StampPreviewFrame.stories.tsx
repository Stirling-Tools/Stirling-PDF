import type { Meta, StoryObj } from "@storybook/react-vite";
import { StampPreviewFrame } from "@editor/components/shared/signatureFields/StampPreviewFrame";
import {
  renderStampPreview,
  stampDetails,
} from "@editor/services/signatureStampPreview";

const labels = {
  signedByLabel: "Digitally signed by {name}",
  dateLabel: "Date:",
  reasonLabel: "Reason:",
  locationLabel: "Location:",
};

function stamp(
  width: number,
  height: number,
  extra: { reason?: string; subject?: string } = {},
): string {
  return (
    renderStampPreview(
      {
        name: "Ada Lovelace",
        details: stampDetails(labels, {
          name: "Ada Lovelace",
          date: new Date("2026-11-24T10:12:05Z"),
          timeZone: "UTC",
          reason: extra.reason ?? "",
          location: "",
          subject: extra.subject,
        }),
        graphic: "NAME",
        image: null,
        watermark: null,
      },
      width,
      height,
    ) ?? ""
  );
}

const meta = {
  title: "Shared/SignatureFields/StampPreviewFrame",
  component: StampPreviewFrame,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
  args: { src: "", alt: "How the signature will look" },
} satisfies Meta<typeof StampPreviewFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultBox: Story = {
  render: (args) => <StampPreviewFrame {...args} src={stamp(200, 50)} />,
};

export const SignatureFieldShaped: Story = {
  render: (args) => (
    <StampPreviewFrame
      {...args}
      src={stamp(188, 58, { reason: "Approved for supply" })}
    />
  ),
};

export const WithCertificateDetails: Story = {
  render: (args) => (
    <StampPreviewFrame
      {...args}
      src={stamp(188, 58, { subject: "CN=Ada Lovelace, O=Example Ltd, C=GB" })}
    />
  ),
};

export const TallBox: Story = {
  render: (args) => <StampPreviewFrame {...args} src={stamp(120, 140)} />,
};
