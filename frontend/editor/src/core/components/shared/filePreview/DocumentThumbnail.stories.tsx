import type { Meta, StoryObj } from "@storybook/react-vite";
import DocumentThumbnail from "@app/components/shared/filePreview/DocumentThumbnail";

const mockFile = new File(["dummy content"], "sample-report.pdf", {
  type: "application/pdf",
});

const meta = {
  title: "Shared/FilePreview/DocumentThumbnail",
  component: DocumentThumbnail,
  parameters: { layout: "padded" },
  args: {
    file: mockFile,
  },
  decorators: [
    (Story) => (
      <div style={{ width: 160, height: 200 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DocumentThumbnail>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithThumbnail: Story = {
  args: {
    thumbnail:
      "data:image/svg+xml;utf8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160"><rect width="120" height="160" fill="#e0e0e0"/></svg>',
      ),
  },
};

export const Encrypted: Story = {
  args: {
    isEncrypted: true,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};
