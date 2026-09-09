import type { Meta, StoryObj } from "@storybook/react-vite";
import CompactFileDetails from "@app/components/fileManager/CompactFileDetails";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1024 * 512,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  ...overrides,
});

const meta = {
  title: "FileManager/CompactFileDetails",
  component: CompactFileDetails,
  args: {
    onPrevious: () => {},
    onNext: () => {},
    onOpenFiles: () => {},
  },
} satisfies Meta<typeof CompactFileDetails>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    currentFile: buildFileStub(),
    thumbnail: null,
    selectedFiles: [buildFileStub()],
    currentFileIndex: 0,
    numberOfFiles: 1,
    isAnimating: false,
  },
};

export const MultipleFiles: Story = {
  args: {
    currentFile: buildFileStub({ name: "invoice-final.pdf", versionNumber: 2 }),
    thumbnail: null,
    selectedFiles: [
      buildFileStub({ id: "file-1" as FileId, name: "invoice-final.pdf" }),
      buildFileStub({ id: "file-2" as FileId, name: "receipt.pdf" }),
      buildFileStub({ id: "file-3" as FileId, name: "statement.pdf" }),
    ],
    currentFileIndex: 1,
    numberOfFiles: 3,
    isAnimating: false,
  },
};

export const NoFileLoaded: Story = {
  args: {
    currentFile: null,
    thumbnail: null,
    selectedFiles: [],
    currentFileIndex: 0,
    numberOfFiles: 0,
    isAnimating: false,
  },
};
