/**
 * The scrolling body of the file manager. It renders one row per leaf file,
 * with each row's version history collapsed underneath it.
 *
 * Three states, all decided by provider data rather than props: files present,
 * no files while still reading them out of storage (a "loading files" line), and
 * no files once that has finished (the full empty state with its upload
 * prompt). Selecting a source other than Recent replaces the list wholesale
 * with the Google Drive placeholder, but that source is chosen inside the
 * provider and so is not reachable from a story.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileListArea from "@app/components/fileManager/FileListArea";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";

const MODIFIED = Date.UTC(2026, 0, 14);

const FILES = [
  makeStub("file-1", "quarterly-report.pdf", {
    versionNumber: 3,
    toolHistory: [{ toolId: "compress", timestamp: MODIFIED }],
  }),
  makeStub("file-2", "invoice-2026-01.pdf"),
  makeStub("file-3", "scan-of-contract.pdf", { size: 18_400_000 }),
];

const meta = {
  title: "FileManager/FileListArea",
  component: FileListArea,
  parameters: { layout: "fullscreen" },
  args: { scrollAreaHeight: "22rem" },
} satisfies Meta<typeof FileListArea>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A populated list, with the second file marked active in the workbench. */
export const Default: Story = {
  decorators: [
    withFileManager({ recentFiles: FILES, activeFileIds: [FILES[1].id] }),
  ],
};

/** Nothing stored yet: the empty state takes over the whole area. */
export const Empty: Story = {
  decorators: [withFileManager({ recentFiles: [] })],
};

/** Still reading from storage — a holding line rather than the empty state. */
export const Loading: Story = {
  decorators: [withFileManager({ recentFiles: [], isLoading: true })],
};
