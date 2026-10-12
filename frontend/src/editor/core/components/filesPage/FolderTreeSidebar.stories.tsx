import type React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderTreeSidebar } from "@app/components/filesPage/FolderTreeSidebar";
import { FileContextProvider } from "@app/contexts/FileContext";
import { FolderProvider } from "@app/contexts/FolderContext";
import { FilesPageProvider } from "@app/contexts/FilesPageContext";
import { ROOT_FOLDER_ID } from "@app/types/folder";

/** Folder and library providers need IndexedDB; no seeded folders leaves only the pinned views. */
function withFolderContexts(Story: () => React.JSX.Element) {
  return (
    <FileContextProvider>
      <FolderProvider>
        <FilesPageProvider>
          <Story />
        </FilesPageProvider>
      </FolderProvider>
    </FileContextProvider>
  );
}

const meta = {
  title: "FilesPage/FolderTreeSidebar",
  component: FolderTreeSidebar,
  decorators: [withFolderContexts],
  args: {
    fileCounts: new Map([[ROOT_FOLDER_ID, 0]]),
    onRequestNewFolder: () => {},
    onRenameFolder: () => {},
    onDeleteFolder: () => {},
    onMoveFilesIntoFolder: async () => {},
  },
} satisfies Meta<typeof FolderTreeSidebar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithFileCounts: Story = {
  args: {
    fileCounts: new Map([[ROOT_FOLDER_ID, 12]]),
  },
};
