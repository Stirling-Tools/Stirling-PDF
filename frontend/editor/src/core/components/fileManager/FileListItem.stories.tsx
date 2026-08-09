/**
 * A single row in the file manager's recent list: checkbox, name, a run of
 * status badges, size/date, and a hover-revealed overflow menu.
 *
 * The badges are the interesting part. Version always shows; "Active" comes
 * from the prop; and the storage badge is one of a mutually exclusive set
 * decided by the stub's remote fields — local only, synced, changes not
 * uploaded, or a shared-with-you pair of ownership and role — most of which
 * additionally require the storage/sharing config to be on. `isHistoryFile`
 * turns the row into an indented, non-selectable version entry instead.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileListItem from "@app/components/fileManager/FileListItem";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";

const MODIFIED = Date.UTC(2026, 0, 14);
const FILE = makeStub("file-1", "quarterly-report.pdf");

/** The default local-only build. */
const local = withFileManager({ recentFiles: [FILE] });

/** Storage plus sharing, for the stories about server-side state. */
const cloud = withFileManager({
  recentFiles: [FILE],
  config: {
    storageEnabled: true,
    storageSharingEnabled: true,
    storageShareLinksEnabled: true,
  },
});

const meta = {
  title: "FileManager/FileListItem",
  component: FileListItem,
  parameters: { layout: "fullscreen" },
  args: {
    file: FILE,
    isSelected: false,
    isLatestVersion: true,
    onSelect: () => {},
    onRemove: () => {},
    onDownload: () => {},
    onDoubleClick: () => {},
  },
} satisfies Meta<typeof FileListItem>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A freshly uploaded file that has never been to the server. */
export const Default: Story = { decorators: [local] };

/** Selected: the checkbox is ticked and the row takes the highlight fill. */
export const Selected: Story = {
  args: { isSelected: true },
  decorators: [local],
};

/** A file currently open in the workbench earns the "Active" badge. */
export const Active: Story = {
  args: { isActive: true },
  decorators: [local],
};

/** A processed file: a higher version number and the tool chain that produced it. */
export const Processed: Story = {
  args: {
    file: makeStub("file-1", "quarterly-report.pdf", {
      versionNumber: 3,
      toolHistory: [
        { toolId: "split", timestamp: MODIFIED },
        { toolId: "compress", timestamp: MODIFIED },
      ],
    }),
  },
  decorators: [local],
};

/**
 * An older version listed under its leaf: indented behind a rule, with no
 * checkbox because history entries cannot be selected.
 */
export const HistoryEntry: Story = {
  args: {
    file: makeStub("file-1", "quarterly-report.pdf", { versionNumber: 2 }),
    isHistoryFile: true,
    isLatestVersion: false,
  },
  decorators: [local],
};

/** Uploaded and current: "Synced" replaces the local-only badge. */
export const Synced: Story = {
  args: {
    file: makeStub("file-1", "quarterly-report.pdf", {
      remoteStorageId: 7,
      remoteStorageUpdatedAt: MODIFIED + 60_000,
    }),
  },
  decorators: [cloud],
};

/** Edited since the last upload, so the badge warns instead. */
export const ChangesNotUploaded: Story = {
  args: {
    file: makeStub("file-1", "quarterly-report.pdf", {
      lastModified: MODIFIED + 3_600_000,
      createdAt: MODIFIED + 3_600_000,
      remoteStorageId: 7,
      remoteStorageUpdatedAt: MODIFIED,
    }),
  },
  decorators: [cloud],
};

/** Someone else's file: ownership and the read-only role are both called out. */
export const SharedWithYou: Story = {
  args: {
    file: makeStub("file-1", "budget-from-alex.pdf", {
      remoteStorageId: 11,
      remoteOwnedByCurrentUser: false,
      remoteOwnerUsername: "alex",
      remoteAccessRole: "viewer",
    }),
  },
  decorators: [cloud],
};

/** The user's own file with a live link out. */
export const SharedByYou: Story = {
  args: {
    file: makeStub("file-1", "quarterly-report.pdf", {
      remoteStorageId: 7,
      remoteStorageUpdatedAt: MODIFIED + 60_000,
      remoteHasShareLinks: true,
    }),
  },
  decorators: [cloud],
};
