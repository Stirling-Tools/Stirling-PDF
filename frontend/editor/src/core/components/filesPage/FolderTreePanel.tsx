/** Folder tree navigator panel rendered next to FileSidebar on /files. */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FolderTreeSidebar } from "@app/components/filesPage/FolderTreeSidebar";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import { useFolders } from "@app/contexts/FolderContext";
import { FileId } from "@app/types/file";
import { FolderId, FolderRecord } from "@app/types/folder";
import {
  MIN_WIDTH,
  MAX_WIDTH,
  clamp,
  computeAutoFitWidth,
  loadPersistedWidth,
  savePersistedWidth,
} from "@app/components/filesPage/folderTreeWidth";

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
  const folders = useFolders();
  const rootLabel = t("filesPage.allFiles", "All files");

  const [width, setWidth] = useState<number>(() => {
    const persisted = loadPersistedWidth();
    return persisted ?? 256;
  });
  const userSetRef = useRef<boolean>(loadPersistedWidth() !== null);

  // Auto-fit to the longest folder name on first render and whenever the
  // folder list grows; skipped once the user manually resizes.
  useEffect(() => {
    if (userSetRef.current) return;
    const auto = computeAutoFitWidth(folders.folders, rootLabel);
    setWidth(auto);
  }, [folders.folders, rootLabel]);

  const dragStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const onMouseMove = useCallback((e: MouseEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    const next = clamp(state.startWidth + (e.clientX - state.startX));
    setWidth(next);
  }, []);

  const onMouseUp = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;
    dragStateRef.current = null;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    userSetRef.current = true;
    setWidth((current) => {
      savePersistedWidth(current);
      return current;
    });
  }, [onMouseMove]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragStateRef.current = { startX: e.clientX, startWidth: width };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onMouseMove, onMouseUp, width],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 32 : 8;
      let next: number | null = null;
      if (e.key === "ArrowLeft") next = clamp(width - step);
      else if (e.key === "ArrowRight") next = clamp(width + step);
      else if (e.key === "Home") next = MIN_WIDTH;
      else if (e.key === "End") next = MAX_WIDTH;
      if (next === null) return;
      e.preventDefault();
      userSetRef.current = true;
      setWidth(next);
      savePersistedWidth(next);
    },
    [width],
  );

  return (
    <div
      className="folder-tree-panel"
      data-active={String(active)}
      aria-hidden={!active}
      style={
        active
          ? ({
              "--folder-tree-panel-width": `${width}px`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="folder-tree-panel-inner">
        <div className="folder-tree-panel-header">
          <span className="folder-tree-panel-title">
            {t("filesPage.myFiles", "My Files")}
          </span>
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
      {active && (
        <div
          className="folder-tree-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          aria-valuenow={width}
          aria-label={t(
            "filesPage.resizeFolderTree",
            "Resize folder tree (arrow keys, Shift for bigger steps)",
          )}
          tabIndex={0}
          onMouseDown={onMouseDown}
          onKeyDown={onKeyDown}
          onDoubleClick={() => {
            const auto = computeAutoFitWidth(folders.folders, rootLabel);
            userSetRef.current = false;
            setWidth(auto);
            savePersistedWidth(auto);
          }}
        />
      )}
    </div>
  );
}
