/**
 * The scrolling list that fills the file manager. Which branch it renders is
 * decided entirely by context — the active source, whether files are loading,
 * and whether any survive the search filter — so the stories drive it through
 * the provider rather than through props.
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import FileListArea from "@app/components/fileManager/FileListArea";
import {
  makeStub,
  withFileManager,
} from "@app/components/fileManager/storyFixtures";
import type { FileId } from "@app/types/file";

const FILES = [
  makeStub("f1", "quarterly-report.pdf"),
  makeStub("f2", "signed-contract.pdf", { size: 840_000 }),
  makeStub("f3", "scan-2026-03-14.pdf", { size: 12_600_000 }),
  makeStub("f4", "minutes.pdf", { size: 96_000 }),
];

const meta: Meta<typeof FileListArea> = {
  title: "FileManager/FileListArea",
  component: FileListArea,
  parameters: { layout: "padded" },
  args: { scrollAreaHeight: "26rem" },
};
export default meta;

type Story = StoryObj<typeof FileListArea>;

export const Default: Story = {
  decorators: [withFileManager({ recentFiles: FILES })],
};

/** No files at all — the list gives way to the empty state. */
export const Empty: Story = {
  decorators: [withFileManager({ recentFiles: [] })],
};

export const Loading: Story = {
  decorators: [withFileManager({ recentFiles: FILES, isLoading: true })],
};

/** Files already open in the editor are marked as active in the list. */
export const WithActiveFile: Story = {
  decorators: [
    withFileManager({
      recentFiles: FILES,
      activeFileIds: ["f2" as FileId],
    }),
  ],
};

/** Enough rows to scroll, which is the normal state for a working library. */
export const ManyFiles: Story = {
  decorators: [
    withFileManager({
      recentFiles: Array.from({ length: 24 }, (_, i) =>
        makeStub(`many-${i}`, `document-${String(i + 1).padStart(3, "0")}.pdf`),
      ),
    }),
  ],
};

/** A short frame proves the list scrolls inside its own box, not the page. */
export const ShortFrame: Story = {
  args: { scrollAreaHeight: "12rem" },
  decorators: [withFileManager({ recentFiles: FILES })],
};
