import type { Meta, StoryObj } from "@storybook/react-vite";
import FilePreview from "@app/components/shared/FilePreview";
import { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockFile: StirlingFileStub = {
  id: "file-1" as FileId,
  name: "annual-report.pdf",
  type: "application/pdf",
  size: 245_000,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
};

const meta = {
  title: "Shared/FilePreview",
  component: FilePreview,
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <div style={{ width: "12rem", height: "12rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FilePreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: mockFile,
    thumbnail: null,
  },
};

export const Empty: Story = {
  args: {
    file: null,
  },
};

export const WithNavigation: Story = {
  args: {
    file: mockFile,
    thumbnail: null,
    showStacking: true,
    showHoverOverlay: true,
    showNavigation: true,
    totalFiles: 3,
    onFileClick: () => {},
    onPrevious: () => {},
    onNext: () => {},
  },
};
