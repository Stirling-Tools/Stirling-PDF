import { useState, memo } from "react";
import {
  Group,
  Menu,
  Text,
  TextInput,
  Tooltip,
  Stack,
  Box,
  Badge,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { formatFileSize, detectFileExtension } from "@editor/utils/fileUtils";
import { DraftRowKind } from "@editor/hooks/tools/addAttachments/useAttachmentManager";
import type { AttachmentPin } from "@editor/services/attachmentService";

export interface AttachmentRowProps {
  id: string;
  filename: string;
  originalName: string;
  size?: number;
  kind: DraftRowKind;
  pin?: AttachmentPin;
  isPlacingPin?: boolean;
  disabled?: boolean;
  isSaving?: boolean;
  isDownloading?: boolean;
  onExtractSingle?: (filename: string) => void;
  onToggleDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onStartPinPlacement?: (id: string) => void;
  onClearPin?: (id: string) => void;
}

export const AttachmentRow = memo(function AttachmentRow({
  id,
  filename,
  originalName,
  size,
  kind,
  pin,
  isPlacingPin = false,
  disabled = false,
  isSaving = false,
  isDownloading = false,
  onExtractSingle,
  onToggleDelete,
  onRestore,
  onRename,
  onStartPinPlacement,
  onClearPin,
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

  const badgeText = isStaged
    ? t("attachments.badges.staged", "NEW")
    : isRenamed
      ? t("attachments.badges.renamed", "RENAMED")
      : isDeleted
        ? t("attachments.badges.deleted", "DELETED")
        : null;

  const metaDetails = [
    badgeText,
    size !== undefined ? formatFileSize(size) : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          </Group>

          <Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
            {pin && (
              <Tooltip
                label={t("attachments.movePin", "Move pin to another page")}
              >
                <Badge
                  size="xs"
                  variant="light"
                  color="blue"
                  data-testid="attachment-pin-link"
                  role={onStartPinPlacement ? "button" : undefined}
                  tabIndex={onStartPinPlacement ? 0 : undefined}
                  aria-label={
                    onStartPinPlacement
                      ? t("attachments.movePin", "Move pin to another page")
                      : undefined
                  }
                  onClick={
                    onStartPinPlacement
                      ? () => onStartPinPlacement(id)
                      : undefined
                  }
                  onKeyDown={
                    onStartPinPlacement
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onStartPinPlacement(id);
                          }
                        }
                      : undefined
                  }
                  style={{
                    cursor: onStartPinPlacement ? "pointer" : "default",
                    textTransform: "none",
                    fontWeight: 500,
                    fontSize: "0.7rem",
                    padding: "0 6px",
                    height: 18,
                  }}
                  leftSection={<Icon name="map-pin" size={10} />}
                >
                  {t("attachments.pinBadge", "P{{page}}", {
                    page: pin.pageIndex + 1,
                  })}
                </Badge>
              </Tooltip>
            )}

            {(badgeText || size !== undefined) && (
              <Text
                size="xs"
                c="dimmed"
                truncate="end"
                style={{
                  minWidth: 0,
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: 1.2,
                }}
              >
                {metaDetails}
              </Text>
            )}
          </Group>
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
              {onStartPinPlacement && (
                <Tooltip
                  label={
                    isPlacingPin
                      ? t("attachments.placingPinShort", "Click a page")
                      : pin
                        ? t("attachments.movePin", "Move pin to another page")
                        : t("attachments.placePin", "Place pin on page")
                  }
                >
                  <ActionIcon
                    variant={isPlacingPin ? "secondary" : "tertiary"}
                    accent={isPlacingPin || pin ? "brand" : "neutral"}
                    size="sm"
                    aria-label={
                      pin
                        ? t("attachments.movePin", "Move pin to another page")
                        : t("attachments.placePin", "Place pin on page")
                    }
                    aria-pressed={isPlacingPin}
                    data-testid={`attachment-pin-action-${id}`}
                    onClick={() => onStartPinPlacement(id)}
                    disabled={disabled || isSaving}
                  >
                    <Icon name="map-pin" size={15} />
                  </ActionIcon>
                </Tooltip>
              )}

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

              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon
                    variant="tertiary"
                    size="sm"
                    aria-label={t(
                      "attachments.moreActions",
                      "More attachment actions",
                    )}
                    disabled={disabled || isSaving}
                  >
                    <Icon name="ellipsis-vertical" size={15} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {pin && onStartPinPlacement && (
                    <Menu.Item
                      leftSection={<Icon name="map-pin" size={14} />}
                      onClick={() => onStartPinPlacement(id)}
                    >
                      {t("attachments.movePin", "Move pin to another page")}
                    </Menu.Item>
                  )}
                  {pin && onClearPin && (
                    <Menu.Item
                      leftSection={<Icon name="x" size={14} />}
                      onClick={() => onClearPin(id)}
                    >
                      {t("attachments.removePin", "Remove pin")}
                    </Menu.Item>
                  )}
                  <Menu.Item
                    leftSection={<Icon name="pencil" size={14} />}
                    onClick={handleStartRename}
                  >
                    {t("attachments.rename", "Rename attachment")}
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<Icon name="trash" size={14} />}
                    onClick={() => onToggleDelete(id)}
                  >
                    {t("attachments.remove", "Remove attachment")}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </>
          )}
        </Group>
      )}
    </Group>
  );
});
