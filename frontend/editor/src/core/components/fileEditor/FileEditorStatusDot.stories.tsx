import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileEditorStatusDot } from "@app/components/fileEditor/FileEditorStatusDot";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockFile: StirlingFileStub = {
  id: "file-1" as FileId,
  name: "document.pdf",
  type: "application/pdf",
  size: 12345,
  lastModified: Date.now(),
  isLeaf: true,
  originalFileId: "file-1",
  versionNumber: 1,
};

/** Core-flavor stub: renders nothing (desktop-only save-status indicator). */
const meta: Meta<typeof FileEditorStatusDot> = {
  title: "FileEditor/FileEditorStatusDot",
  component: FileEditorStatusDot,
  parameters: { layout: "padded" },
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: mockFile,
  },
};
