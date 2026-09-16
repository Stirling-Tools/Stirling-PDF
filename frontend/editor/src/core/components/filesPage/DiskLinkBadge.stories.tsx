import type { Meta, StoryObj } from "@storybook/react-vite";
import { DiskLinkBadge } from "@app/components/filesPage/DiskLinkBadge";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

/** The healthy and never-on-disk cases are here because they must render nothing;
 *  a story is the cheapest way to keep that honest. */
const meta: Meta<typeof DiskLinkBadge> = {
  title: "FilesPage/DiskLinkBadge",
  component: DiskLinkBadge,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

function stub(overrides: Partial<StirlingFileStub>): StirlingFileStub {
  return {
    id: "story-file" as FileId,
    name: "quarterly-report.pdf",
    type: "application/pdf",
    size: 1105,
    lastModified: 1_700_000_000_000,
    isLeaf: true,
    originalFileId: "story-file",
    versionNumber: 1,
    ...overrides,
  } as StirlingFileStub;
}

/** Its original was deleted or moved; this copy is the only one left. */
export const Orphaned: Story = {
  args: {
    file: stub({ orphanedFilePath: "C:\\Users\\ada\\Documents\\report.pdf" }),
  },
};

/** Disk moved on while there were unsaved edits here. */
export const Conflict: Story = {
  args: {
    file: stub({
      localFilePath: "C:\\Users\\ada\\Documents\\report.pdf",
      diskConflictAt: 1_700_000_500_000,
      isDirty: true,
    }),
  },
};

/** Icon-only, as it appears in the dense list rows. */
export const OrphanedCompact: Story = {
  args: {
    file: stub({ orphanedFilePath: "C:\\Users\\ada\\Documents\\report.pdf" }),
    compact: true,
  },
};

export const ConflictCompact: Story = {
  args: {
    file: stub({
      localFilePath: "C:\\Users\\ada\\Documents\\report.pdf",
      diskConflictAt: 1_700_000_500_000,
    }),
    compact: true,
  },
};

/** Healthy link - renders nothing. */
export const Linked: Story = {
  args: {
    file: stub({ localFilePath: "C:\\Users\\ada\\Documents\\report.pdf" }),
  },
};

/** Never came from disk - renders nothing. */
export const NotFromDisk: Story = {
  args: { file: stub({}) },
};
