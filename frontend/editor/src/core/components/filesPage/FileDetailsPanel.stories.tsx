import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDetailsPanel } from "@app/components/filesPage/FileDetailsPanel";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";
import type { FolderRecord } from "@app/types/folder";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 245_760,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "file-1" as FileId,
  versionNumber: 1,
  ...overrides,
});

const folder: FolderRecord = {
  id: "folder-1" as FolderRecord["id"],
  name: "Contracts",
  parentFolderId: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

const meta = {
  title: "FilesPage/FileDetailsPanel",
  component: FileDetailsPanel,
} satisfies Meta<typeof FileDetailsPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

const singleFile = buildFileStub();
const fileMap = new Map<FileId, StirlingFileStub>([
  [singleFile.id, singleFile],
]);

export const Default: Story = {
  args: {
    selectedFileIds: [singleFile.id],
    fileMap,
    currentFolder: null,
    onClose: () => {},
    onAddToWorkspace: () => {},
    onMove: () => {},
    onRemove: () => {},
  },
};

export const InFolder: Story = {
  args: {
    ...Default.args,
    currentFolder: folder,
  },
};

export const MultiSelect: Story = {
  args: (() => {
    const fileA = buildFileStub({ id: "file-a" as FileId, name: "a.pdf" });
    const fileB = buildFileStub({
      id: "file-b" as FileId,
      name: "b.pdf",
      size: 102_400,
    });
    return {
      selectedFileIds: [fileA.id, fileB.id],
      fileMap: new Map<FileId, StirlingFileStub>([
        [fileA.id, fileA],
        [fileB.id, fileB],
      ]),
      currentFolder: null,
      onClose: () => {},
      onAddToWorkspace: () => {},
      onMove: () => {},
      onRemove: () => {},
    };
  })(),
};

export const LocalOnlyWithSaveToServer: Story = {
  args: {
    ...Default.args,
    onSaveToServer: () => {},
  },
};
