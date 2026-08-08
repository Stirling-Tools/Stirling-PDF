/**
 * The resizable rail that holds the folder tree on the Files page. It supplies
 * the heading and the drag/keyboard resize handle around FolderTreeSidebar, and
 * wires the tree's folder actions through to the Files page context.
 *
 * `active` is the only prop: an inactive panel is collapsed away by CSS, hidden
 * from assistive technology, and drops its resize handle, so the tab it belongs
 * to can slide in and out. Its width is otherwise self-managed — auto-fitted to
 * the longest folder name until the user drags it, after which the chosen width
 * is persisted.
 *
 * No folders are seeded into IndexedDB, so the tree shows only its pinned rows.
 */
import type { ReactElement } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderTreePanel } from "@app/components/filesPage/FolderTreePanel";
import { FileContextProvider } from "@app/contexts/FileContext";
import { FolderProvider } from "@app/contexts/FolderContext";
import { FilesPageProvider } from "@app/contexts/FilesPageContext";

/**
 * The panel reads the folder tree from FolderContext and the file counts and
 * folder dialogs from FilesPageContext; both sit above FileContext, which
 * brings in IndexedDBContext. None are part of the shared preview decorators.
 */
function withFolderContexts(Story: () => ReactElement) {
  return (
    <FileContextProvider>
      <FolderProvider>
        <FilesPageProvider>
          <div style={{ display: "flex", height: "24rem" }}>
            <Story />
          </div>
        </FilesPageProvider>
      </FolderProvider>
    </FileContextProvider>
  );
}

const meta = {
  title: "FilesPage/FolderTreePanel",
  component: FolderTreePanel,
  parameters: { layout: "fullscreen" },
  decorators: [withFolderContexts],
} satisfies Meta<typeof FolderTreePanel>;
export default meta;

type Story = StoryObj<typeof meta>;

/** Open: the heading, the tree, and the resize handle down the right edge. */
export const Active: Story = {
  args: { active: true },
};

/** Collapsed for a tab that is not showing folders. */
export const Inactive: Story = {
  args: { active: false },
};
