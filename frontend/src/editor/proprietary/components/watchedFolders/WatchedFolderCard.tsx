import { useState } from "react";
import { Box, Text, Group, Loader } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import { Icon } from "@app/ui/Icon";
import { WatchedFolder } from "@app/types/watchedFolders";
import { FolderRunStatus } from "@app/hooks/useFolderRunStatuses";
import { iconMap } from "@app/components/tools/automate/iconMap";

// The 12px status glyphs scale the app stroke to under 1px; this keeps them legible.
const STATUS_DOT_STROKE = 2.5;

interface WatchedFolderCardProps {
  folder: WatchedFolder;
  isActive: boolean;
  status: FolderRunStatus;
  onSelect: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onFileDrop?: (fileIds: string[]) => void;
}

export function WatchedFolderCard({
  folder,
  isActive,
  status,
  onSelect,
  onEdit,
  onDelete,
  onFileDrop,
}: WatchedFolderCardProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const folderIcon = iconMap[folder.icon ?? ""] ?? iconMap.FolderIcon;

  const handleDragOver = (e: React.DragEvent) => {
    const types = e.dataTransfer.types;
    if (
      !types.includes("watchedFolderFileId") &&
      !types.includes("watchedFolderFileIds")
    )
      return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const multiRaw = e.dataTransfer.getData("watchedFolderFileIds");
    if (multiRaw) {
      try {
        const ids: string[] = JSON.parse(multiRaw);
        if (ids.length > 0 && onFileDrop) onFileDrop(ids);
        return;
      } catch {
        /* fall through */
      }
    }
    const fileId = e.dataTransfer.getData("watchedFolderFileId");
    if (fileId && onFileDrop) onFileDrop([fileId]);
  };

  return (
    <Box
      className="tool-button-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={
        isDragOver
          ? {
              backgroundColor:
                "color-mix(in srgb, var(--c-primary) 10%, transparent)",
              borderRadius: "var(--mantine-radius-sm)",
            }
          : undefined
      }
    >
      <Button
        variant="tertiary"
        accent="neutral"
        size="sm"
        className="tool-button"
        fullWidth
        justify="start"
        style={
          isActive
            ? { backgroundColor: "var(--tool-button-selected-bg)" }
            : undefined
        }
        leftSection={
          <Box
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              backgroundColor: `${folder.accentColor}22`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Icon
              name={folderIcon}
              size={11}
              style={{ color: folder.accentColor }}
            />
          </Box>
        }
        rightSection={
          isHovered ? (
            <Group gap={2} onClick={(e) => e.stopPropagation()}>
              <ActionIcon
                as="span"
                size="sm"
                variant="tertiary"
                onClick={onEdit}
                aria-label={t("watchedFolders.card.edit", "Edit folder")}
              >
                <Icon name="pencil" size={11} />
              </ActionIcon>
              {!folder.isDefault && (
                <ActionIcon
                  as="span"
                  size="sm"
                  variant="tertiary"
                  accent="danger"
                  onClick={onDelete}
                  aria-label={t("watchedFolders.card.delete", "Delete folder")}
                >
                  <Icon name="trash" size={11} />
                </ActionIcon>
              )}
            </Group>
          ) : folder.isPaused ? (
            <Icon
              name="circle-pause"
              size={12}
              strokeWidth={STATUS_DOT_STROKE}
              style={{ color: "var(--mantine-color-dimmed)" }}
            />
          ) : status === "processing" ? (
            <Loader size={10} color={folder.accentColor} />
          ) : status === "done" ? (
            <Icon
              name="circle-check"
              size={12}
              strokeWidth={STATUS_DOT_STROKE}
              style={{ color: "var(--color-green-500)" }}
            />
          ) : null
        }
        onClick={onSelect}
      >
        <Text
          size="sm"
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {folder.name}
        </Text>
      </Button>
    </Box>
  );
}
