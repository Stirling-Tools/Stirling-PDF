import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Menu } from "@mantine/core";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import HomeIcon from "@mui/icons-material/Home";
import DevicesOtherIcon from "@mui/icons-material/DevicesOther";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";

import { useFolders } from "@app/contexts/FolderContext";
import { FileId } from "@app/types/file";
import {
  FolderId,
  FolderRecord,
  FolderTreeNode,
  ROOT_FOLDER_ID,
} from "@app/types/folder";
import { useFilesPage } from "@app/contexts/FilesPageContext";
import {
  FILES_PAGE_DRAG_TYPE,
  parseFilesPageDragPayload,
  serialiseFilesPageDragPayload,
} from "@app/components/filesPage/dragDrop";
import { useDropTarget } from "@app/components/filesPage/useDropTarget";

/**
 * Hard cap on folder-tree render depth. The backend already enforces an
 * application-level depth limit via cycle detection + folder-count cap,
 * and React's render stack handles ~50 nested components comfortably,
 * so this is purely defensive against a corrupted IDB cache producing
 * a chain deeper than the server would allow.
 */
const MAX_TREE_DEPTH = 50;

interface FolderTreeSidebarProps {
  fileCounts: Map<FolderId | null, number>;
  onRequestNewFolder: (parentId: FolderId | null) => void;
  onRenameFolder: (folder: FolderRecord) => void;
  onDeleteFolder: (folder: FolderRecord) => void;
  /**
   * Move the *dragged* files (from the drop payload) into the target folder.
   * Earlier signature took only the folder id and the parent then used the
   * current selection - which silently moved the wrong files whenever the
   * user dragged something that wasn't in the selection.
   */
  onMoveFilesIntoFolder: (
    folderId: FolderId | null,
    fileIds: FileId[],
  ) => Promise<void> | void;
}

// This component is always rendered inside FolderTreePanel, which supplies
// its own <aside> chrome and "New folder at root" toolbar control. An
// earlier `embed` prop selected between an embedded list and a standalone
// aside+header layout; the standalone layout was unused and its "New
// folder at root" ActionIcon was not gated by `serverReachable`, so if
// anyone re-wired the component into a non-embed surface they'd ship an
// always-enabled mutation button against a possibly-offline server.
// Deleted to remove the trap.
export function FolderTreeSidebar({
  fileCounts,
  onRequestNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFilesIntoFolder,
}: FolderTreeSidebarProps) {
  const { t } = useTranslation();
  const { tree, currentFolderId, setCurrentFolderId } = useFolders();
  const { currentTab, setCurrentTab, moveFolderTo } = useFilesPage();

  return (
    <div
      className="files-page-tree-list"
      role="tree"
      aria-label={t("filesPage.tree", "Folders")}
    >
      <RootRow
        fileCount={fileCounts.get(ROOT_FOLDER_ID) ?? 0}
        isActive={
          currentFolderId === ROOT_FOLDER_ID &&
          (currentTab === "all" || currentTab === "cloud")
        }
        onSelect={() => {
          // Picking the root re-enters the cloud bucket - also switch out
          // of any virtual tab so the user lands somewhere consistent.
          if (currentTab !== "all" && currentTab !== "cloud") {
            setCurrentTab("all");
          }
          setCurrentFolderId(ROOT_FOLDER_ID);
        }}
        onDropFiles={(fileIds) =>
          onMoveFilesIntoFolder(ROOT_FOLDER_ID, fileIds)
        }
      />
      <LocalRow
        isActive={currentTab === "local"}
        onSelect={() => setCurrentTab("local")}
      />
      {tree.map((node) => (
        <TreeNodeRow
          key={node.folder.id}
          node={node}
          fileCounts={fileCounts}
          currentFolderId={currentFolderId}
          // Same dance as RootRow: clicking a cloud folder must drop the
          // virtual-tab highlight (Local/Recent/Shared), otherwise the row
          // AND the tab both look "active" simultaneously.
          onSelect={(id) => {
            if (currentTab !== "all" && currentTab !== "cloud") {
              setCurrentTab("all");
            }
            setCurrentFolderId(id);
          }}
          onMoveFolder={async (folderId, newParentId) => {
            // Route through filesPage.moveFolderTo so the cycle case
            // surfaces an error banner instead of silently no-op'ing.
            await moveFolderTo(folderId, newParentId);
          }}
          onMoveFiles={onMoveFilesIntoFolder}
          onRequestNewFolder={onRequestNewFolder}
          onRenameFolder={onRenameFolder}
          onDeleteFolder={onDeleteFolder}
        />
      ))}
    </div>
  );
}

interface RootRowProps {
  fileCount: number;
  isActive: boolean;
  onSelect: () => void;
  onDropFiles: (fileIds: FileId[]) => Promise<void> | void;
}

function RootRow({ fileCount, isActive, onSelect, onDropFiles }: RootRowProps) {
  const { t } = useTranslation();
  const { setError } = useFolders();
  const { handlers, isOver } = useDropTarget({
    dragType: FILES_PAGE_DRAG_TYPE,
    onDrop: (e) => {
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.kind === "files") {
        Promise.resolve(onDropFiles(payload.fileIds)).catch((err) => {
          console.error("[RootRow] file drop failed", err);
          setError(
            err instanceof Error
              ? t("filesPage.error.moveFilesFailedDetail", {
                  message: err.message,
                  defaultValue: `Could not move files: ${err.message}`,
                })
              : t("filesPage.error.moveFilesFailed", "Could not move files."),
          );
        });
      }
    },
  });

  return (
    <div
      role="treeitem"
      aria-selected={isActive}
      tabIndex={0}
      className={`files-page-tree-node${isActive ? " is-active" : ""}${
        isOver ? " is-drop-target" : ""
      }`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      {...handlers}
    >
      <span className="files-page-tree-spacer" />
      <span className="files-page-tree-icon">
        <HomeIcon fontSize="small" />
      </span>
      <span className="files-page-tree-name">
        {t("filesPage.allFiles", "All files")}
      </span>
      <span className="files-page-tree-count">{fileCount}</span>
    </div>
  );
}

interface LocalRowProps {
  isActive: boolean;
  onSelect: () => void;
}

/**
 * Pinned pseudo-folder row that selects the Local tab. Local files don't
 * belong to a folder (folders are a cloud concept) so this row is not a
 * drop target and has no count badge - the Local view scopes by predicate
 * (`remoteStorageId == null`), not by folderId.
 */
function LocalRow({ isActive, onSelect }: LocalRowProps) {
  const { t } = useTranslation();
  return (
    <div
      role="treeitem"
      aria-selected={isActive}
      tabIndex={0}
      className={`files-page-tree-node${isActive ? " is-active" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="files-page-tree-spacer" />
      <span className="files-page-tree-icon">
        <DevicesOtherIcon fontSize="small" />
      </span>
      <span className="files-page-tree-name">
        {t("filesPage.tabName.local", "Local")}
      </span>
    </div>
  );
}

interface TreeNodeRowProps {
  node: FolderTreeNode;
  fileCounts: Map<FolderId | null, number>;
  currentFolderId: FolderId | null;
  onSelect: (id: FolderId) => void;
  onMoveFolder: (
    folderId: FolderId,
    newParentId: FolderId | null,
  ) => Promise<void> | void;
  onMoveFiles: (
    folderId: FolderId | null,
    fileIds: FileId[],
  ) => Promise<void> | void;
  onRequestNewFolder: (parentId: FolderId | null) => void;
  onRenameFolder: (folder: FolderRecord) => void;
  onDeleteFolder: (folder: FolderRecord) => void;
}

function TreeNodeRow({
  node,
  fileCounts,
  currentFolderId,
  onSelect,
  onMoveFolder,
  onMoveFiles,
  onRequestNewFolder,
  onRenameFolder,
  onDeleteFolder,
}: TreeNodeRowProps) {
  const { t } = useTranslation();
  const { serverReachable, setError } = useFolders();
  const { currentTab } = useFilesPage();
  const offlineHint = t(
    "filesPage.offlineNoFolderEdits",
    "Offline - folder changes are disabled.",
  );
  const [open, setOpen] = useState(true);

  // Only highlight the folder row when we're actually in a cloud-rooted
  // view. Otherwise (Local/Recent/Shared tabs) it'd compete with the tab
  // highlight and confuse the user about "where they are".
  const isActive =
    currentFolderId === node.folder.id &&
    (currentTab === "all" || currentTab === "cloud");
  const hasChildren = node.children.length > 0;
  const indent = useMemo(
    () => ({ paddingLeft: `${14 + node.depth * 16}px` }),
    [node.depth],
  );

  const { handlers: dropHandlers, isOver: isDropTarget } = useDropTarget({
    dragType: FILES_PAGE_DRAG_TYPE,
    onDrop: (e) => {
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.kind === "files") {
        // Use payload.fileIds - not the current selection - so dragging a
        // non-selected file moves *that* file. Surface failures via the
        // shared error banner rather than letting them become unhandled
        // rejections that only the dev console sees.
        Promise.resolve(onMoveFiles(node.folder.id, payload.fileIds)).catch(
          (err) => {
            console.error("[TreeNodeRow] file drop failed", err);
            setError(
              err instanceof Error
                ? t("filesPage.error.moveFilesFailedDetail", {
                    message: err.message,
                    defaultValue: `Could not move files: ${err.message}`,
                  })
                : t("filesPage.error.moveFilesFailed", "Could not move files."),
            );
          },
        );
      } else if (payload.kind === "folder") {
        Promise.resolve(onMoveFolder(payload.folderId, node.folder.id)).catch(
          (err) => {
            console.error("[TreeNodeRow] folder drop failed", err);
            setError(
              err instanceof Error
                ? t("filesPage.error.moveFolderFailedDetail", {
                    message: err.message,
                    defaultValue: `Could not move folder: ${err.message}`,
                  })
                : t(
                    "filesPage.error.moveFolderFailed",
                    "Could not move folder.",
                  ),
            );
          },
        );
      }
    },
  });

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(
        FILES_PAGE_DRAG_TYPE,
        serialiseFilesPageDragPayload({
          kind: "folder",
          folderId: node.folder.id,
        }),
      );
      e.dataTransfer.effectAllowed = "move";
    },
    [node.folder.id],
  );

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div
        role="treeitem"
        aria-selected={isActive}
        aria-expanded={hasChildren ? open : undefined}
        tabIndex={0}
        draggable
        style={indent}
        className={`files-page-tree-node${isActive ? " is-active" : ""}${
          isDropTarget ? " is-drop-target" : ""
        }`}
        onClick={() => onSelect(node.folder.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onContextMenu={(e) => {
          // Open the action menu on right-click rather than a native
          // window.prompt (unstyled, untranslatable, unusable on mobile).
          e.preventDefault();
          setMenuOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(node.folder.id);
          } else if (e.key === "ArrowRight" && hasChildren) {
            setOpen(true);
          } else if (e.key === "ArrowLeft") {
            setOpen(false);
          }
        }}
        {...dropHandlers}
        onDragStart={handleDragStart}
      >
        {hasChildren ? (
          <span
            className="files-page-tree-toggle"
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? (
              <KeyboardArrowDownIcon fontSize="small" />
            ) : (
              <KeyboardArrowRightIcon fontSize="small" />
            )}
          </span>
        ) : (
          <span className="files-page-tree-spacer" />
        )}
        <span className="files-page-tree-icon">
          <FolderThumbnail color={node.folder.color} size="tree" />
        </span>
        <span className="files-page-tree-name">{node.folder.name}</span>
        <span className="files-page-tree-count">
          {fileCounts.get(node.folder.id) ?? 0}
        </span>
        <Menu
          opened={menuOpen}
          onChange={setMenuOpen}
          withinPortal
          position="bottom-end"
          shadow="md"
          width={200}
        >
          <Menu.Target>
            <ActionIcon
              size="xs"
              variant="subtle"
              className="files-page-tree-kebab"
              aria-label={t(
                "filesPage.treeMenu.actions",
                "Folder actions for {{name}}",
                { name: node.folder.name },
              )}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              <MoreVertIcon fontSize="small" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<EditIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onRenameFolder(node.folder);
              }}
              disabled={!serverReachable}
              title={!serverReachable ? offlineHint : undefined}
            >
              {t("filesPage.treeMenu.rename", "Rename")}
            </Menu.Item>
            <Menu.Item
              leftSection={<CreateNewFolderIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onRequestNewFolder(node.folder.id);
              }}
              disabled={!serverReachable}
              title={!serverReachable ? offlineHint : undefined}
            >
              {t("filesPage.treeMenu.newSubfolder", "New subfolder")}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<DeleteOutlineIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder(node.folder);
              }}
              disabled={!serverReachable}
              title={!serverReachable ? offlineHint : undefined}
            >
              {t("filesPage.treeMenu.delete", "Delete folder")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
      {open &&
        // Cap render recursion at MAX_TREE_DEPTH to guarantee a finite
        // call stack even if a future bug (or a hand-edited IDB cache)
        // produces a folder chain deeper than the server enforces. Any
        // realistic user tree stays well under this; the cap exists so
        // the renderer fails closed rather than blowing the JS stack.
        node.depth < MAX_TREE_DEPTH &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.folder.id}
            node={child}
            fileCounts={fileCounts}
            currentFolderId={currentFolderId}
            onSelect={onSelect}
            onMoveFolder={onMoveFolder}
            onMoveFiles={onMoveFiles}
            onRequestNewFolder={onRequestNewFolder}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
          />
        ))}
    </>
  );
}
