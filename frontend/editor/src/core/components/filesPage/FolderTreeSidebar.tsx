import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { FolderThumbnail } from "@app/components/filesPage/FolderThumbnail";

import { useFolders } from "@app/contexts/FolderContext";
import { FileId } from "@app/types/file";
import {
  FolderId,
  folderKind,
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
import "@app/components/filesPage/FolderTreeSidebar.css";
import { useOpenFolder } from "@app/components/filesPage/useOpenFolder";

/** Bound recursion to protect rendering from corrupted folder hierarchies. */
const MAX_TREE_DEPTH = 50;

interface FolderTreeSidebarProps {
  fileCounts: Map<FolderId | null, number>;
  onRequestNewFolder: (parentId: FolderId | null) => void;
  onRenameFolder: (folder: FolderRecord) => void;
  onDeleteFolder: (folder: FolderRecord) => void;
  /** Move the IDs from the drag payload, which can differ from the current selection. */
  onMoveFilesIntoFolder: (
    folderId: FolderId | null,
    fileIds: FileId[],
  ) => Promise<void> | void;
}

/** Preserve both ends because folder names often differ only at the end. */
function MiddleTruncated({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  const TAIL = 6;
  if (text.length <= TAIL + 4) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span className={className} title={text}>
      <span className="files-page-tree-name-head">
        {text.slice(0, text.length - TAIL)}
      </span>
      <span className="files-page-tree-name-tail">{text.slice(-TAIL)}</span>
    </span>
  );
}

export function FolderTreeSidebar({
  fileCounts,
  onRequestNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveFilesIntoFolder,
}: FolderTreeSidebarProps) {
  const { t } = useTranslation();
  const { tree, currentFolderId } = useFolders();
  const openFolder = useOpenFolder();
  const { currentTab, setCurrentTab, moveFolderTo, setOriginFilter } =
    useFilesPage();

  return (
    <div
      className="files-page-tree-list"
      role="tree"
      aria-label={t("filesPage.tree", "Folders")}
    >
      <RecentRow
        isActive={currentTab === "recent"}
        onSelect={() => setCurrentTab("recent")}
      />
      <RootRow
        fileCount={fileCounts.get(ROOT_FOLDER_ID) ?? 0}
        isActive={
          currentFolderId === ROOT_FOLDER_ID &&
          (currentTab === "all" || currentTab === "cloud")
        }
        onSelect={() => {
          openFolder(ROOT_FOLDER_ID);
          setOriginFilter("all");
        }}
        onDropFiles={(fileIds) =>
          onMoveFilesIntoFolder(ROOT_FOLDER_ID, fileIds)
        }
      />
      {tree.map((node) => (
        <TreeNodeRow
          key={node.folder.id}
          node={node}
          fileCounts={fileCounts}
          currentFolderId={currentFolderId}
          onSelect={(id) => {
            openFolder(id);
            setOriginFilter("all");
          }}
          onMoveFolder={async (folderId, newParentId) => {
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
      <span className="files-page-tree-icon">
        <Icon name="house" size={18} />
      </span>
      <span className="files-page-tree-name">
        {t("filesPage.allFiles", "Stirling library")}
      </span>
      <span className="files-page-tree-count">{fileCount}</span>
    </div>
  );
}

interface RecentRowProps {
  isActive: boolean;
  onSelect: () => void;
}

function RecentRow({ isActive, onSelect }: RecentRowProps) {
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
      <span className="files-page-tree-icon">
        <Icon name="clock" size={18} />
      </span>
      <span className="files-page-tree-name">
        {t("filesPage.recentFiles", "Recents")}
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

  const kind = folderKind(node.folder);
  const editsDisabled =
    kind === "local" || (kind === "server" && !serverReachable);
  const { currentTab } = useFilesPage();
  const offlineHint = t(
    "filesPage.offlineNoFolderEdits",
    "Offline - folder changes are disabled.",
  );
  const [open, setOpen] = useState(true);

  // Filter tabs own the active highlight even when a folder remains remembered.
  const isActive =
    currentFolderId === node.folder.id &&
    (currentTab === "all" || currentTab === "cloud");
  const hasChildren = node.children.length > 0;

  const { handlers: dropHandlers, isOver: isDropTarget } = useDropTarget({
    dragType: FILES_PAGE_DRAG_TYPE,
    onDrop: (e) => {
      const payload = parseFilesPageDragPayload(e.dataTransfer);
      if (!payload) return;
      if (payload.kind === "files") {
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
        style={{ paddingInlineStart: 8 + node.depth * 16 }}
        className={`files-page-tree-node${isActive ? " is-active" : ""}${
          isDropTarget ? " is-drop-target" : ""
        }`}
        onClick={() => onSelect(node.folder.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onContextMenu={(e) => {
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
        <span className="files-page-tree-icon">
          <FolderThumbnail color={node.folder.color} size="tree" />
        </span>
        <MiddleTruncated
          className="files-page-tree-name"
          text={node.folder.name}
        />
        {hasChildren && (
          <span
            className="files-page-tree-toggle"
            aria-hidden="true"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? (
              <Icon name="chevron-down" size={16} />
            ) : (
              <Icon name="chevron-right" size={16} />
            )}
          </span>
        )}
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
              size="sm"
              variant="tertiary"
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
              <Icon name="ellipsis-vertical" size={20} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="pencil" size={20} />}
              onClick={(e) => {
                e.stopPropagation();
                onRenameFolder(node.folder);
              }}
              disabled={editsDisabled}
              title={
                kind === "local"
                  ? t(
                      "filesPage.localFolderManagedByDisk",
                      "This folder is managed by its directory on disk.",
                    )
                  : editsDisabled
                    ? offlineHint
                    : undefined
              }
            >
              {t("filesPage.treeMenu.rename", "Rename")}
            </Menu.Item>
            <Menu.Item
              leftSection={<Icon name="folder-plus" size={20} />}
              onClick={(e) => {
                e.stopPropagation();
                onRequestNewFolder(node.folder.id);
              }}
              disabled={editsDisabled}
              title={
                kind === "local"
                  ? t(
                      "filesPage.localFolderManagedByDisk",
                      "This folder is managed by its directory on disk.",
                    )
                  : editsDisabled
                    ? offlineHint
                    : undefined
              }
            >
              {t("filesPage.treeMenu.newSubfolder", "New subfolder")}
            </Menu.Item>
            <Menu.Divider />
            {/* Removing a mount detaches its record; filesystem directories are never deleted here. */}
            {(kind !== "local" || node.folder.parentFolderId === null) && (
              <Menu.Item
                color="red"
                leftSection={<Icon name="trash" size={20} />}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(node.folder);
                }}
                disabled={kind === "server" && !serverReachable}
                title={
                  kind === "server" && !serverReachable
                    ? offlineHint
                    : undefined
                }
              >
                {kind === "local"
                  ? t("filesPage.removeLocalFolder", "Unmount from Stirling")
                  : t("filesPage.treeMenu.delete", "Delete folder")}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
      {open &&
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
