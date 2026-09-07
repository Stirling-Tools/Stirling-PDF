import type { Meta, StoryObj } from "@storybook/react-vite";
import ThumbnailPreview from "@app/components/tools/validateSignature/reportView/ThumbnailPreview";

const meta = {
  title: "Tools/ValidateSignature/ReportView/ThumbnailPreview",
  component: ThumbnailPreview,
} satisfies Meta<typeof ThumbnailPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

const SAMPLE_THUMBNAIL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160"><rect width="120" height="160" fill="#f0f0f0"/></svg>',
  );

export const Default: Story = {
  args: {
    thumbnailUrl: SAMPLE_THUMBNAIL,
    fileName: "signed-contract.pdf",
  },
};

export const NoThumbnail: Story = {
  args: {
    thumbnailUrl: null,
    fileName: "signed-contract.pdf",
  },
};
