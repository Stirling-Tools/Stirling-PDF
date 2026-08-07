import { useState, memo } from "react";
import { Group, Text, TextInput, Badge, Tooltip, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { formatFileSize } from "@app/utils/fileUtils";
import { DraftRowKind } from "@app/hooks/tools/addAttachments/useAttachmentManager";

export interface AttachmentRowProps {
  id: string;
  filename: string;
  originalName: string;
  size?: number;
  kind: DraftRowKind;
  disabled?: boolean;
  isSaving?: boolean;
  isDownloading?: boolean;
  onExtractSingle?: (filename: string) => void;
  onToggleDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onRename: (id: string, newName: string) => void;
}

export const AttachmentRow = memo(function AttachmentRow({
  id,
  filename,
  originalName,
  size,
  kind,
  disabled = false,
  isSaving = false,
  isDownloading = false,
  onExtractSingle,
  onToggleDelete,
  onRestore,
  onRename,
}: AttachmentRowProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingName, setEditingName] = useState<string>(filename);

  const isDeleted = kind === "deleted";
  const isStaged = kind === "staged";
  const isRenamed = kind === "renamed";

  const handleStartRename = () => {
    setEditingName(filename);
    setIsEditing(true);
  };

  const handleCommitRename = () => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onRename(id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelRename = () => {
    setEditingName(filename);
    setIsEditing(false);
  };

  const tooltipLabel = isRenamed
    ? `${filename} (original: ${originalName})`
    : filename;

  return (
    <Group
      gap="xs"
      wrap="nowrap"
      px="xs"
      py={6}
      style={{
        border: "1px solid var(--c-border, var(--mantine-color-gray-3))",
        borderRadius: "var(--mantine-radius-sm)",
        opacity: isDeleted ? 0.65 : 1,
        backgroundColor: isStaged
          ? "var(--c-surface-sunken)"
          : isDeleted
            ? "var(--c-surface-sunken)"
            : undefined,
        borderStyle: isStaged ? "dashed" : "solid",
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <LocalIcon
        icon="attachment-rounded"
        width="16"
        height="16"
        style={{ flexShrink: 0 }}
      />

      {isEditing ? (
        <Group gap={4} style={{ flex: 1, minWidth: 0 }}>
          <TextInput
            value={editingName}
            onChange={(e) => setEditingName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCommitRename();
              } else if (e.key === "Escape") {
                handleCancelRename();
              }
            }}
            size="xs"
            data-autofocus
            style={{ flex: 1, minWidth: 0 }}
          />
          <ActionIcon
            variant="tertiary"
            accent="brand"
            size="sm"
            aria-label={t("save", "Save")}
            onClick={handleCommitRename}
          >
            <LocalIcon icon="check" width="14" height="14" />
          </ActionIcon>
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={t("cancel", "Cancel")}
            onClick={handleCancelRename}
          >
            <LocalIcon icon="close-rounded" width="14" height="14" />
          </ActionIcon>
        </Group>
      ) : (
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
            <Tooltip label={tooltipLabel} openDelay={400}>
              <Text
                size="sm"
                fw={500}
                c={isDeleted ? "dimmed" : undefined}
                truncate="end"
                style={{
                  flex: 1,
                  minWidth: 0,
                  textDecoration: isDeleted ? "line-through" : undefined,
                }}
              >
                {filename}
              </Text>
            </Tooltip>

            {isStaged && (
              <Badge
                size="xs"
                color="teal"
                variant="light"
                style={{ flexShrink: 0 }}
              >
                {t("attachments.badges.staged", "NEW")}
              </Badge>
            )}

            {isRenamed && (
              <Badge
                size="xs"
                color="orange"
                variant="light"
                style={{ flexShrink: 0 }}
              >
                {t("attachments.badges.renamed", "RENAMED")}
              </Badge>
            )}

            {isDeleted && (
              <Badge
                size="xs"
                color="red"
                variant="light"
                style={{ flexShrink: 0 }}
              >
                {t("attachments.badges.deleted", "DELETED")}
              </Badge>
            )}
          </Group>

          {size !== undefined && (
            <Text
              size="xs"
              c="dimmed"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatFileSize(size)}
            </Text>
          )}
        </Stack>
      )}

      {/* CLUSTERED ACTIONS ON FAR RIGHT */}
      {!isEditing && (
        <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
          {isDeleted ? (
            <Tooltip label={t("attachments.restore", "Undo delete")}>
              <ActionIcon
                variant="tertiary"
                size="sm"
                aria-label={t("attachments.restore", "Undo delete")}
                onClick={() => onRestore(id)}
                disabled={disabled || isSaving}
              >
                <LocalIcon icon="undo-rounded" width="15" height="15" />
              </ActionIcon>
            </Tooltip>
          ) : (
            <>
              {!isStaged && onExtractSingle && (
                <Tooltip
                  label={t("attachments.downloadSingle", "Download attachment")}
                >
                  <ActionIcon
                    variant="tertiary"
                    size="sm"
                    aria-label={t(
                      "attachments.downloadSingle",
                      "Download attachment",
                    )}
                    onClick={() => onExtractSingle(originalName)}
                    disabled={disabled || isSaving}
                    loading={isDownloading}
                  >
                    <LocalIcon icon="download-rounded" width="15" height="15" />
                  </ActionIcon>
                </Tooltip>
              )}

              <Tooltip label={t("attachments.rename", "Rename attachment")}>
                <ActionIcon
                  variant="tertiary"
                  size="sm"
                  aria-label={t("attachments.rename", "Rename attachment")}
                  onClick={handleStartRename}
                  disabled={disabled || isSaving}
                >
                  <LocalIcon icon="edit" width="15" height="15" />
                </ActionIcon>
              </Tooltip>

              <Tooltip label={t("attachments.remove", "Remove attachment")}>
                <ActionIcon
                  variant="tertiary"
                  accent="danger"
                  size="sm"
                  aria-label={t("attachments.remove", "Remove attachment")}
                  onClick={() => onToggleDelete(id)}
                  disabled={disabled || isSaving}
                >
                  <LocalIcon
                    icon={isStaged ? "close-rounded" : "delete-rounded"}
                    width="15"
                    height="15"
                  />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      )}
    </Group>
  );
});
