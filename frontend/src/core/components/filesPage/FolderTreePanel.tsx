/**
 * FolderTreePanel - folder tree navigator rendered as a secondary panel
 * attached to the main FileSidebar. Slides in/out when My Files is active.
 *
 * Shares state with the main file grid via FilesPageContext.
 */

import React from "react";
import { useTranslation } from "react-i18next";

import { FolderTreeSidebar } from "@app/components/filesPage/FolderTreeSidebar";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { FileId } from "@app/types/file";
import { FolderId, FolderRecord } from "@app/types/folder";

import "@app/components/filesPage/FolderTreePanel.css";

interface FolderTreePanelProps {
  active: boolean;
}

export function FolderTreePanel({ active }: FolderTreePanelProps) {
  const { t } = useTranslation();
  const {
    fileCountsByFolder,
    openNewFolderDialog,
    openRenameFolderDialog,
    promptDeleteFolder,
    moveFilesTo,
  } = useFilesPage();

  return (
    <div
      className="folder-tree-panel"
      data-active={String(active)}
      aria-hidden={!active}
    >
      <div className="folder-tree-panel-inner">
        <div className="folder-tree-panel-header">
          <span className="folder-tree-panel-title">
            {t("filesPage.myFiles", "My Files")}
          </span>
          {/* "New folder at root" lives in the file-manager toolbar; the
              previous duplicate ActionIcon here added visual noise without
              improving discoverability. */}
        </div>

        <FolderTreeSidebar
          fileCounts={fileCountsByFolder}
          onRequestNewFolder={openNewFolderDialog}
          onRenameFolder={(folder: FolderRecord) =>
            openRenameFolderDialog(folder)
          }
          onDeleteFolder={promptDeleteFolder}
          onMoveFilesIntoFolder={async (
            targetId: FolderId | null,
            fileIds: FileId[],
          ) => {
            if (fileIds.length === 0) return;
            await moveFilesTo(fileIds, targetId);
          }}
        />
      </div>
    </div>
  );
}
