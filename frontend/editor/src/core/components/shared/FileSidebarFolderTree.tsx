import { FolderTreeSidebar } from "@app/components/filesPage/FolderTreeSidebar";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import type { FolderId, FolderRecord } from "@app/types/folder";
import type { FileId } from "@app/types/file";

/** The library's folder tree. */
export default function FileSidebarFolderTree() {
  const filesPage = useFilesPage();
  return (
    <div className="file-sidebar-folders-section sidebar-content-fade">
      <FolderTreeSidebar
        fileCounts={filesPage.fileCountsByFolder}
        onRequestNewFolder={filesPage.openNewFolderDialog}
        onRenameFolder={(folder: FolderRecord) =>
          filesPage.openRenameFolderDialog(folder)
        }
        onDeleteFolder={filesPage.promptDeleteFolder}
        onMoveFilesIntoFolder={async (
          targetId: FolderId | null,
          fileIds: FileId[],
        ) => {
          if (fileIds.length === 0) return;
          await filesPage.moveFilesTo(fileIds, targetId);
        }}
      />
    </div>
  );
}
