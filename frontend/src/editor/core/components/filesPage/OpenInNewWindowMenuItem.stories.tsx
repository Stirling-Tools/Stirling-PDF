import type { Meta, StoryObj } from "@storybook/react-vite";
import { OpenInNewWindowMenuItem } from "@app/components/filesPage/OpenInNewWindowMenuItem";
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

/** Core-flavor stub: renders nothing (desktop-only menu item). */
const meta = {
  title: "FilesPage/OpenInNewWindowMenuItem",
  component: OpenInNewWindowMenuItem,
} satisfies Meta<typeof OpenInNewWindowMenuItem>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    file: mockFile,
  },
};
