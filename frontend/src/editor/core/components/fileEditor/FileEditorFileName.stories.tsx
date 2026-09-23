import type { Meta, StoryObj } from "@storybook/react-vite";
import FileEditorFileName from "@app/components/fileEditor/FileEditorFileName";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

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
