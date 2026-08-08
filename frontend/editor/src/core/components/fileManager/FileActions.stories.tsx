/**
 * The action bar above the recent-files list: select-all, an optional storage
 * filter, the selection count, and the bulk delete/download/upload/share
 * buttons.
 *
 * What appears is decided by the storage config and by the current selection.
 * The upload button needs storage on; the share button additionally needs
 * sharing and share links on, which also widen the filter from All/Local to
 * include the two "shared" tabs. The delete and download buttons are always
 * present but disabled until something is selected, and the whole bar renders
 * nothing at all while there are no recent files.
 *
 * Selection is provider state seeded from `activeFileIds`, so the stories vary
 * that rather than a prop.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileActions from "@app/components/fileManager/FileActions";
import type { FileId } from "@app/types/file";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";

const FILES = [
  makeStub("file-1", "quarterly-report.pdf"),
  makeStub("file-2", "invoice-2026-01.pdf"),
  makeStub("file-3", "scan.pdf"),
];

const meta = {
  title: "FileManager/FileActions",
  component: FileActions,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof FileActions>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Local-only build, nothing selected: bulk actions present but inert. */
export const Default: Story = {
  decorators: [withFileManager({ recentFiles: FILES })],
};

/** With a selection the count appears and delete/download become live. */
export const WithSelection: Story = {
  decorators: [
    withFileManager({
      recentFiles: FILES,
      activeFileIds: [FILES[0].id, FILES[1].id],
    }),
  ],
};

/** Storage on adds the All/Local filter and the bulk upload button. */
export const StorageEnabled: Story = {
  decorators: [
    withFileManager({
      recentFiles: FILES,
      activeFileIds: [FILES[0].id],
      config: { storageEnabled: true },
    }),
  ],
};

/**
 * Sharing and share links on add the share button and the two "shared" filter
 * tabs.
 */
export const SharingEnabled: Story = {
  decorators: [
    withFileManager({
      recentFiles: FILES,
      activeFileIds: [FILES[0].id],
      config: {
        storageEnabled: true,
        storageSharingEnabled: true,
        storageShareLinksEnabled: true,
      },
    }),
  ],
};

/**
 * A selection that includes a file owned by someone else: bulk upload and share
 * stay disabled because they only apply to files the user owns.
 */
export const SelectionIncludesSharedFile: Story = {
  decorators: [
    withFileManager({
      recentFiles: [
        FILES[0],
        makeStub("file-shared", "budget-from-alex.pdf", {
          remoteStorageId: 42,
          remoteOwnedByCurrentUser: false,
          remoteOwnerUsername: "alex",
          remoteAccessRole: "viewer",
        }),
      ],
      activeFileIds: [FILES[0].id, "file-shared" as FileId],
      config: {
        storageEnabled: true,
        storageSharingEnabled: true,
        storageShareLinksEnabled: true,
      },
    }),
  ],
};

/** With no recent files the bar renders nothing. */
export const NoFiles: Story = {
  decorators: [withFileManager({ recentFiles: [] })],
};
