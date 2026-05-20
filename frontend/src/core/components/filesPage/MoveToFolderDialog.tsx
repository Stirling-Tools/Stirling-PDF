import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import HomeIcon from "@mui/icons-material/Home";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import CloseIcon from "@mui/icons-material/Close";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";

import { FolderId, FolderRecord, ROOT_FOLDER_ID } from "@app/types/folder";

interface MoveToFolderDialogProps {
  opened: boolean;
  onClose: () => void;
  folders: FolderRecord[];
  /**
   * When moving a folder, pass its id so its own descendants are
   * excluded from the candidate destinations (no cycles).
   */
  disabledFolderId?: FolderId | null;
  initialFolderId?: FolderId | null;
  onConfirm: (folderId: FolderId | null) => void | Promise<void>;
  /**
   * Optional - when supplied, the dialog renders an inline "Create new
   * folder" affordance that calls this back with the desired name and
   * the currently-highlighted target as parent. After creation the new
   * folder becomes the move target so the user can confirm the move
   * without bouncing out of the dialog.
   *
   * When omitted (e.g. caller doesn't have server folder write access)
   * the affordance is hidden entirely.
   */
  onCreateFolder?: (
    name: string,
    parentFolderId: FolderId | null,
  ) => Promise<FolderRecord>;
}

export function MoveToFolderDialog({
  opened,
  onClose,
  folders,
  disabledFolderId,
  initialFolderId = ROOT_FOLDER_ID,
  onConfirm,
  onCreateFolder,
}: MoveToFolderDialogProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<FolderId | null>(initialFolderId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Inline create-folder state. Hidden by default - reveal via the
  // "Create new folder" button below the tree. Keeping it in the same
  // dialog avoids the user having to cancel out, create, and come back.
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset when reopening with a new initial.
  React.useEffect(() => {
    if (opened) {
      setTarget(initialFolderId);
      setSubmitting(false);
      setError(null);
      setCreatingFolder(false);
      setNewFolderName("");
      setCreating(false);
    }
  }, [opened, initialFolderId]);

  /**
   * One pass over `folders` to build {@code byParent}, the {@code depthById}
   * cache, and the blocked set. The previous code rebuilt {@code byId}
   * inside every {@code NestedPick} render (O(N²) per dialog open).
   */
  const { depthById, blocked, treeOrder } = useMemo(() => {
    const byParent = new Map<FolderId | null, FolderRecord[]>();
    for (const folder of folders) {
      const list = byParent.get(folder.parentFolderId) ?? [];
      list.push(folder);
      byParent.set(folder.parentFolderId, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      );
    }

    // Pre-order DFS - children appear directly under their parent.
    // Capped at MAX_TREE_DEPTH for the same reason as FolderTreeSidebar
    // and FolderContext.build (kept in lockstep at 50): a corrupted IDB
    // cache or hand-edited folder chain deeper than the server enforces
    // would otherwise blow the JS stack here. Silent truncate - any
    // descendant beyond depth 50 just won't appear as a move target,
    // which is a strict improvement over a crash.
    const MAX_TREE_DEPTH = 50;
    const order: FolderRecord[] = [];
    const depths = new Map<FolderId, number>();
    const visit = (parent: FolderId | null, depth: number) => {
      if (depth >= MAX_TREE_DEPTH) return;
      for (const child of byParent.get(parent) ?? []) {
        order.push(child);
        depths.set(child.id, depth);
        visit(child.id, depth + 1);
      }
    };
    visit(null, 0);

    const blockedSet = new Set<FolderId>();
    if (disabledFolderId) {
      const stack: FolderId[] = [disabledFolderId];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (blockedSet.has(cur)) continue;
        blockedSet.add(cur);
        for (const child of byParent.get(cur) ?? []) {
          stack.push(child.id);
        }
      }
    }

    return { depthById: depths, blocked: blockedSet, treeOrder: order };
  }, [disabledFolderId, folders]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("filesPage.moveDialog.title", "Move to folder")}
      centered
      size="md"
      keepMounted
      transitionProps={{ duration: 0 }}
    >
      <Stack gap="xs">
        <Text size="sm" c="dimmed">
          {t(
            "filesPage.moveDialog.hint",
            "Pick a destination folder. Tip: you can also drag and drop files onto folders in the tree on the left.",
          )}
        </Text>
        <div
          style={{
            border: "1px solid var(--border-subtle)",
            borderRadius: "0.5rem",
            maxHeight: "20rem",
            overflowY: "auto",
          }}
        >
          <FolderPick
            label={t("filesPage.allFiles", "All files")}
            isActive={target === ROOT_FOLDER_ID}
            disabled={false}
            depth={0}
            isRoot
            onPick={() => setTarget(ROOT_FOLDER_ID)}
          />
          {treeOrder.map((folder) => (
            <FolderPick
              key={folder.id}
              label={folder.name}
              color={folder.color}
              isActive={target === folder.id}
              disabled={blocked.has(folder.id)}
              depth={depthById.get(folder.id) ?? 0}
              onPick={() => setTarget(folder.id)}
            />
          ))}
        </div>
        {/* Inline "Create new folder" affordance. Hidden until the user
            clicks the button so the dialog stays compact. Once revealed
            it creates a folder under the currently-highlighted target
            (the chosen parent) and selects the new folder so the user
            can immediately confirm the move. */}
        {onCreateFolder &&
          (() => {
            const trimmedName = newFolderName.trim();
            const handleCreate = async () => {
              if (trimmedName.length === 0) return;
              setCreating(true);
              setError(null);
              try {
                const created = await onCreateFolder(
                  trimmedName,
                  // The selected destination is the parent. If the user
                  // picked "All files" (root), the new folder sits at root.
                  target === ROOT_FOLDER_ID ? null : target,
                );
                setTarget(created.id);
                setCreatingFolder(false);
                setNewFolderName("");
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : t(
                        "filesPage.moveDialog.newFolderError",
                        "Could not create folder. Try again.",
                      ),
                );
              } finally {
                setCreating(false);
              }
            };
            const handleCancel = () => {
              setCreatingFolder(false);
              setNewFolderName("");
            };
            return creatingFolder ? (
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  label={t(
                    "filesPage.moveDialog.newFolderLabel",
                    "New folder name",
                  )}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.currentTarget.value)}
                  placeholder={t(
                    "filesPage.moveDialog.newFolderPlaceholder",
                    "Folder name",
                  )}
                  style={{ flex: 1 }}
                  disabled={creating}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreate();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      handleCancel();
                    }
                  }}
                  autoFocus
                />
                <Button
                  loading={creating}
                  disabled={trimmedName.length === 0}
                  onClick={handleCreate}
                >
                  {t("filesPage.moveDialog.newFolderCreate", "Create")}
                </Button>
                {/* X icon - collapses the inline create row without
                    closing the whole dialog. Earlier this was a "Cancel"
                    button which visually clashed with the dialog footer
                    Cancel (two identical labels confusing the user). */}
                <Tooltip
                  label={t("filesPage.moveDialog.newFolderCancel", "Discard")}
                  withinPortal
                >
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="lg"
                    onClick={handleCancel}
                    disabled={creating}
                    aria-label={t(
                      "filesPage.moveDialog.newFolderCancel",
                      "Discard",
                    )}
                  >
                    <CloseIcon fontSize="small" />
                  </ActionIcon>
                </Tooltip>
              </Group>
            ) : (
              <Button
                variant="subtle"
                size="sm"
                leftSection={<CreateNewFolderIcon fontSize="small" />}
                onClick={() => {
                  setCreatingFolder(true);
                  setNewFolderName("");
                }}
                styles={{ root: { alignSelf: "flex-start" } }}
              >
                {t(
                  "filesPage.moveDialog.newFolderToggle",
                  "Create new folder…",
                )}
              </Button>
            );
          })()}
        {error && (
          <Alert
            color="red"
            icon={<ErrorOutlineIcon fontSize="small" />}
            variant="light"
            role="alert"
          >
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            {t("filesPage.moveDialog.cancel", "Cancel")}
          </Button>
          <Button
            loading={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              try {
                await onConfirm(target);
                onClose();
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : t(
                        "filesPage.moveDialog.error",
                        "Could not move. Try again.",
                      ),
                );
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {t("filesPage.moveDialog.confirm", "Move here")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface FolderPickProps {
  label: string;
  color?: string;
  isActive: boolean;
  disabled: boolean;
  depth: number;
  isRoot?: boolean;
  onPick: () => void;
}

function FolderPick({
  label,
  color,
  isActive,
  disabled,
  depth,
  isRoot,
  onPick,
}: FolderPickProps) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      style={{
        all: "unset",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: `0.4rem 0.75rem 0.4rem ${0.75 + depth * 0.85}rem`,
        width: "100%",
        background: isActive ? "var(--hover-bg)" : "transparent",
        borderBottom: "1px solid var(--border-subtle)",
        boxSizing: "border-box",
        fontWeight: isActive ? 600 : 400,
      }}
    >
      {isRoot ? (
        <HomeIcon fontSize="small" />
      ) : isActive ? (
        <FolderOpenIcon fontSize="small" style={{ color }} />
      ) : (
        <FolderIcon fontSize="small" style={{ color }} />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
    </button>
  );
}
