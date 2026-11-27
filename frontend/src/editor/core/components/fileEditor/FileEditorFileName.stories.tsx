import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import FileEditorFileName from "@editor/components/fileEditor/FileEditorFileName";
import type { StirlingFileStub } from "@editor/types/fileContext";
import type { FileId } from "@editor/types/file";

const buildFileStub = (
  overrides: Partial<StirlingFileStub> = {},
): StirlingFileStub => ({
  id: "file-1" as FileId,
  name: "report.pdf",
  type: "application/pdf",
  size: 1024,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
  ...overrides,
});

const meta = {
  title: "FileEditor/FileEditorFileName",
  component: FileEditorFileName,
  args: {
    editing: false,
    onEditingChange: fn(),
    onRename: fn(async () => {}),
  },
} satisfies Meta<typeof FileEditorFileName>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: buildFileStub(),
  },
};

export const LongFileName: Story = {
  args: {
    file: buildFileStub({
      name: "annual-financial-report-quarter-four-2026-final-version.pdf",
    }),
    maxLength: 30,
  },
};

export const Editing: Story = {
  args: {
    file: buildFileStub(),
    editing: true,
  },
};
