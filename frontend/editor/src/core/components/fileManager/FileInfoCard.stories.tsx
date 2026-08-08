/**
 * The details card on the right of the file manager: name, format, size, date
 * and version, followed by whatever the file's storage situation warrants.
 *
 * The trailing rows are all conditional and are driven by the stub's remote
 * fields rather than by props. A file with no `remoteStorageId` is local only;
 * one the user owns on the server shows a sync state that turns to "changes not
 * uploaded" once its local timestamp is newer than the remote one; one owned by
 * somebody else shows the owner and offers a copy. Sharing rows additionally
 * need the storage/sharing config on, and a tool chain appears only when the
 * file carries history.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileInfoCard from "@app/components/fileManager/FileInfoCard";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";

const MODIFIED = Date.UTC(2026, 0, 14);

/** The default local-only build. */
const local = withFileManager();

/** Storage plus sharing, for the stories about server-side state. */
const cloud = withFileManager({
  config: {
    storageEnabled: true,
    storageSharingEnabled: true,
    storageShareLinksEnabled: true,
  },
});

const meta = {
  title: "FileManager/FileInfoCard",
  component: FileInfoCard,
  args: { modalHeight: "600px" },
  decorators: [
    (Story) => (
      <div style={{ width: "22rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FileInfoCard>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A file that has never left the browser: the "Local only" badge, nothing else. */
export const LocalOnly: Story = {
  args: { currentFile: makeStub("file-1", "quarterly-report.pdf") },
  decorators: [local],
};

/** No file selected — the labels stay, their values are blank. */
export const NoFileSelected: Story = {
  args: { currentFile: null },
  decorators: [local],
};

/** A file that has been through tools carries its chain as badges. */
export const WithToolHistory: Story = {
  args: {
    currentFile: makeStub("file-1", "quarterly-report.pdf", {
      versionNumber: 3,
      toolHistory: [
        { toolId: "split", timestamp: MODIFIED },
        { toolId: "compress", timestamp: MODIFIED },
      ],
    }),
  },
  decorators: [local],
};

/** Uploaded and current: the cloud row reads "Synced" and shows the sync time. */
export const SyncedToCloud: Story = {
  args: {
    currentFile: makeStub("file-1", "quarterly-report.pdf", {
      remoteStorageId: 7,
      remoteStorageUpdatedAt: MODIFIED + 60_000,
    }),
  },
  decorators: [cloud],
};

/** Edited since the last upload, so the cloud row warns instead. */
export const ChangesNotUploaded: Story = {
  args: {
    currentFile: makeStub("file-1", "quarterly-report.pdf", {
      lastModified: MODIFIED + 3_600_000,
      createdAt: MODIFIED + 3_600_000,
      remoteStorageId: 7,
      remoteStorageUpdatedAt: MODIFIED,
    }),
  },
  decorators: [cloud],
};

/** Someone else's file: owner row, "Shared with you" badge, and a copy action. */
export const SharedWithYou: Story = {
  args: {
    currentFile: makeStub("file-1", "budget-from-alex.pdf", {
      remoteStorageId: 11,
      remoteOwnedByCurrentUser: false,
      remoteOwnerUsername: "alex",
      remoteAccessRole: "viewer",
    }),
  },
  decorators: [cloud],
};

/** The user's own file with links out: a sharing row and the management entry. */
export const SharedByYou: Story = {
  args: {
    currentFile: makeStub("file-1", "quarterly-report.pdf", {
      remoteStorageId: 7,
      remoteStorageUpdatedAt: MODIFIED + 60_000,
      remoteHasShareLinks: true,
    }),
  },
  decorators: [cloud],
};
