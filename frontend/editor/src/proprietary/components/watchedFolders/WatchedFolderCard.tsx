import { useState } from "react";
import { Box, Text, Group, Loader } from "@mantine/core";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlined";
import { WatchedFolder } from "@app/types/watchedFolders";
import { FolderRunStatus } from "@app/hooks/useFolderRunStatuses";
import { iconMap } from "@app/components/tools/automate/iconMap";
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
  const IconComponent =
    iconMap[folder.icon as keyof typeof iconMap] || iconMap.FolderIcon;
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
              backgroundColor: "rgba(59,130,246,0.10)",
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
            <IconComponent
              style={{ fontSize: 11, color: folder.accentColor }}
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
                <EditIcon style={{ fontSize: 11 }} />
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
                  <DeleteIcon style={{ fontSize: 11 }} />
                </ActionIcon>
              )}
            </Group>
          ) : folder.isPaused ? (
            <PauseCircleOutlineIcon
              style={{ fontSize: 12, color: "var(--mantine-color-dimmed)" }}
            />
          ) : status === "processing" ? (
            <Loader size={10} color={folder.accentColor} />
          ) : status === "done" ? (
            <CheckCircleIcon
              style={{ fontSize: 12, color: "var(--color-green-500)" }}
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
