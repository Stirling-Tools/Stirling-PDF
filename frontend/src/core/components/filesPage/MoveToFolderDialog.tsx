import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import HomeIcon from "@mui/icons-material/Home";
import FolderIcon from "@mui/icons-material/Folder";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
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
}

export function MoveToFolderDialog({
  opened,
  onClose,
  folders,
  disabledFolderId,
  initialFolderId = ROOT_FOLDER_ID,
  onConfirm,
}: MoveToFolderDialogProps) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<FolderId | null>(initialFolderId);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when reopening with a new initial.
  React.useEffect(() => {
    if (opened) {
      setTarget(initialFolderId);
      setSubmitting(false);
      setError(null);
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
    const order: FolderRecord[] = [];
    const depths = new Map<FolderId, number>();
    const visit = (parent: FolderId | null, depth: number) => {
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
