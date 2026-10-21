import { useState, memo } from "react";
import {
  Group,
  Text,
  TextInput,
  Badge,
  Tooltip,
  Stack,
  Box,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { ActionIcon } from "@app/ui/ActionIcon";
import { formatFileSize, detectFileExtension } from "@app/utils/fileUtils";
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

  const ext = detectFileExtension(filename);
  const isPdf = ext === "pdf";

  const getBadgeColor = () => {
    if (isStaged) return "teal";
    if (isRenamed) return "orange";
    if (isDeleted) return "red";
    return "gray";
  };

  const badgeText = isStaged
    ? t("attachments.badges.staged", "NEW")
    : isRenamed
      ? t("attachments.badges.renamed", "RENAMED")
      : isDeleted
        ? t("attachments.badges.deleted", "DELETED")
        : null;

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      px="sm"
      py="xs"
      style={{
        border: "1px solid var(--c-border)",
        borderRadius: "var(--radius-md, 8px)",
        opacity: isDeleted ? 0.6 : 1,
        backgroundColor: isStaged
          ? "color-mix(in srgb, var(--c-primary) 6%, var(--c-surface))"
          : isDeleted
            ? "var(--c-surface-sunken)"
            : "var(--c-surface)",
        borderStyle: isStaged ? "dashed" : "solid",
        borderColor: isStaged
          ? "color-mix(in srgb, var(--c-primary) 40%, var(--c-border))"
          : isDeleted
            ? "color-mix(in srgb, var(--c-danger) 30%, var(--c-border))"
            : "var(--c-border)",
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        transition: "background-color 0.15s ease, border-color 0.15s ease",
      }}
    >
      <Box
        style={{
          width: 32,
          height: 32,
          borderRadius: "var(--radius-sm, 6px)",
          backgroundColor: isPdf
            ? "color-mix(in srgb, var(--c-danger) 12%, transparent)"
            : "var(--c-surface-sunken)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: isPdf ? "var(--c-danger)" : "var(--c-text-muted)",
        }}
      >
        <Icon name={isPdf ? "file-pdf" : "paperclip"} size={16} />
      </Box>

      {isEditing ? (
        <Group gap={6} style={{ flex: 1, minWidth: 0 }}>
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
            <Icon name="check" size={14} />
          </ActionIcon>
          <ActionIcon
            variant="tertiary"
            size="sm"
            aria-label={t("cancel", "Cancel")}
            onClick={handleCancelRename}
          >
            <Icon name="x" size={14} />
          </ActionIcon>
        </Group>
      ) : (
        <Stack gap={2} style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <Group
            gap={6}
            wrap="nowrap"
            style={{ minWidth: 0, width: "100%", overflow: "hidden" }}
          >
            <Box style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <Tooltip label={tooltipLabel} openDelay={400}>
                <Text
                  size="sm"
                  fw={500}
                  c={isDeleted ? "dimmed" : undefined}
                  truncate="end"
                  style={{
                    display: "block",
                    width: "100%",
                    textDecoration: isDeleted ? "line-through" : undefined,
                  }}
                >
                  {filename}
                </Text>
              </Tooltip>
            </Box>

            {badgeText && (
              <Badge
                size="xs"
                variant="light"
                color={getBadgeColor()}
                style={{
                  flexShrink: 0,
                  fontSize: "0.68rem",
                  letterSpacing: "0.03em",
                  padding: "0 6px",
                  height: 18,
                }}
              >
                {badgeText}
              </Badge>
            )}
          </Group>

          {size !== undefined && (
            <Text
              size="xs"
              c="dimmed"
              style={{
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.2,
              }}
            >
              {formatFileSize(size)}
            </Text>
          )}
        </Stack>
      )}

      {!isEditing && (
        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          {isDeleted ? (
            <Tooltip label={t("attachments.restore", "Undo delete")}>
              <ActionIcon
                variant="tertiary"
                size="sm"
                aria-label={t("attachments.restore", "Undo delete")}
                onClick={() => onRestore(id)}
                disabled={disabled || isSaving}
              >
                <Icon name="undo-2" size={15} />
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
                    <Icon name="download" size={15} />
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
                  <Icon name="pencil" size={15} />
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
                  <Icon name={isStaged ? "x" : "trash"} size={15} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
        </Group>
      )}
    </Group>
  );
});
