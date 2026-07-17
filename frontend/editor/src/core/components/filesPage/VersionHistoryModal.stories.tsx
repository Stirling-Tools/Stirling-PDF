import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { VersionHistoryModal } from "@app/components/filesPage/VersionHistoryModal";
import { FileContextProvider } from "@app/contexts/FileContext";
import { NavigationProvider } from "@app/contexts/NavigationContext";
import { ToolRegistryProvider } from "@app/contexts/ToolRegistryProvider";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileId } from "@app/types/file";

const mockFile: StirlingFileStub = {
  id: "file-3" as FileId,
  name: "report-watermarked.pdf",
  type: "application/pdf",
  size: 110592,
  lastModified: 0,
  isLeaf: true,
  originalFileId: "file-1" as FileId,
  versionNumber: 3,
};

/**
 * The modal loads its version chain from IndexedDB (empty in Storybook) and
 * dispatches file/navigation actions on add-to-workspace and remove, so it
 * needs FileContext (also supplies IndexedDBContext) and the tool-registry-
 * backed NavigationContext mounted above it, matching AppProviders.tsx's
 * nesting.
 */
function withProviders(Story: () => ReactElement) {
  return (
    <FileContextProvider>
      <ToolRegistryProvider>
        <NavigationProvider>
          <Story />
        </NavigationProvider>
      </ToolRegistryProvider>
    </FileContextProvider>
  );
}

const meta = {
  title: "FilesPage/VersionHistoryModal",
  component: VersionHistoryModal,
  decorators: [withProviders],
  args: {
    onClose: () => {},
  },
} satisfies Meta<typeof VersionHistoryModal>;
export default meta;

type Story = StoryObj<typeof meta>;

/** No prior versions exist in the (empty) storage, so the modal shows the empty state. */
export const Default: Story = {
  args: {
    opened: true,
    file: mockFile,
  },
};

export const NoFileSelected: Story = {
  args: {
    opened: true,
    file: null,
  },
};
