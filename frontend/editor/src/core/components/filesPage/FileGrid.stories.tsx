import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FileGrid,
  type FilesPageEntry,
} from "@app/components/filesPage/FileGrid";
import { FileContextProvider } from "@app/contexts/FileContext";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1_240_000,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  // Set so useLazyThumbnail short-circuits on the stored thumbnail instead of
  // trying to read file bytes out of IndexedDB.
  thumbnailUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='160'%3E%3Crect width='120' height='160' fill='%23e9ecef'/%3E%3C/svg%3E",
  ...overrides,
});

const localFile = buildFileStub();
const cloudFile = buildFileStub({
  id: "file-2" as FileId,
  name: "shared-invoice.pdf",
  originalFileId: "file-2",
  remoteStorageId: 42,
  remoteOwnedByCurrentUser: true,
});
const spreadsheetFile = buildFileStub({
  id: "file-3" as FileId,
  name: "budget.xlsx",
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  originalFileId: "file-3",
  thumbnailUrl: undefined,
});

const fileEntries: FilesPageEntry[] = [
  { kind: "file", file: localFile },
  { kind: "file", file: cloudFile },
  { kind: "file", file: spreadsheetFile },
];

/**
 * FileGrid renders file cards/rows via useLazyThumbnail, which reads
 * IndexedDBContext + FileContext further up the tree - neither is part of
 * the shared preview decorators, so FileContextProvider is stood up here.
 * Folder entries are intentionally left out of these mocks: FolderCard /
 * FolderRow call useFolders(), which needs a FolderProvider wired to
 * IndexedDB/auth/app-config context this story doesn't stand up.
 */
function withFileContext(Story: () => JSX.Element) {
  return (
    <FileContextProvider>
      <Story />
    </FileContextProvider>
  );
}

const meta = {
  title: "FilesPage/FileGrid",
  component: FileGrid,
  decorators: [withFileContext],
  args: {
    entries: fileEntries,
    selectedFileIds: new Set<FileId>(),
    viewMode: "grid",
    onSelectFile: () => {},
    onOpenFolder: () => {},
    onOpenFile: () => {},
    onMoveFiles: () => {},
    onMoveFolder: () => {},
    onRenameFolder: () => {},
    onDeleteFolder: () => {},
    onChangeFolderAppearance: () => {},
    onRemoveFiles: () => {},
    onPromptMoveFiles: () => {},
  },
} satisfies Meta<typeof FileGrid>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const ListMode: Story = {
  args: {
    viewMode: "list",
  },
};

export const Loading: Story = {
  args: {
    entries: [],
    loading: true,
  },
};

export const Empty: Story = {
  args: {
    entries: [],
    loading: false,
    currentTab: "all",
    onEmptyUpload: () => {},
    onEmptyCreateFolder: () => {},
  },
};
