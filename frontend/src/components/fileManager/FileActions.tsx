import React from "react";
import { Group, Text, ActionIcon, Tooltip, Switch } from "@mantine/core";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import HistoryIcon from "@mui/icons-material/History";
import { useTranslation } from "react-i18next";
import { useFileManagerContext } from "../../contexts/FileManagerContext";

const FileActions: React.FC = () => {
  const { t } = useTranslation();
  const { 
    recentFiles, 
    selectedFileIds, 
    filteredFiles, 
    showAllVersions,
    fileGroups,
    onSelectAll, 
    onDeleteSelected, 
    onDownloadSelected,
    onToggleVersions
  } = useFileManagerContext();

  const handleSelectAll = () => {
    onSelectAll();
  };

  const handleDeleteSelected = () => {
    if (selectedFileIds.length > 0) {
      onDeleteSelected();
    }
  };

  const handleDownloadSelected = () => {
    if (selectedFileIds.length > 0) {
      onDownloadSelected();
    }
  };

  // Only show actions if there are files
  if (recentFiles.length === 0) {
    return null;
  }

  const allFilesSelected = filteredFiles.length > 0 && selectedFileIds.length === filteredFiles.length;
  const hasSelection = selectedFileIds.length > 0;
  
  // Check if there are any files with version history
  const hasVersionedFiles = Array.from(fileGroups.values()).some(versions => versions.length > 1);

  return (
    <div
      style={{
        padding: "0.75rem 1rem",
        backgroundColor: "var(--mantine-color-gray-1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: "3rem",
        position: "relative",
      }}
    >
      {/* Left: Select All and Version Toggle */}
      <Group gap="md">
        <Tooltip
          label={allFilesSelected ? t("fileManager.deselectAll", "Deselect All") : t("fileManager.selectAll", "Select All")}
        >
          <ActionIcon
            variant="light"
            size="sm"
            color="dimmed"
            onClick={handleSelectAll}
            disabled={filteredFiles.length === 0}
            radius="sm"
          >
            <SelectAllIcon style={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>

        {/* Version Toggle - only show if there are versioned files */}
        {hasVersionedFiles && (
          <Tooltip
            label={showAllVersions ? 
              t("fileManager.showLatestOnly", "Show latest versions only") : 
              t("fileManager.showAllVersions", "Show all versions")
            }
          >
            <Group gap="xs" style={{ cursor: 'pointer' }} onClick={onToggleVersions}>
              <HistoryIcon style={{ fontSize: "1rem", color: 'var(--mantine-color-blue-6)' }} />
              <Text size="xs" c="dimmed">
                {showAllVersions ? t("fileManager.allVersions", "All") : t("fileManager.latestOnly", "Latest")}
              </Text>
              <Switch
                size="xs"
                checked={showAllVersions}
                onChange={onToggleVersions}
                style={{ pointerEvents: 'none' }}
              />
            </Group>
          </Tooltip>
        )}
      </Group>

      {/* Center: Selected count */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        {hasSelection && (
          <Text size="sm" c="dimmed" fw={500}>
            {t("fileManager.selectedCount", "{{count}} selected", { count: selectedFileIds.length })}
          </Text>
        )}
      </div>

      {/* Right: Delete and Download */}
      <Group gap="xs">
        <Tooltip label={t("fileManager.deleteSelected", "Delete Selected")}>
          <ActionIcon
            variant="light"
            size="sm"
            color="dimmed"
            onClick={handleDeleteSelected}
            disabled={!hasSelection}
            radius="sm"
          >
            <DeleteIcon style={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t("fileManager.downloadSelected", "Download Selected")}>
          <ActionIcon
            variant="light"
            size="sm"
            color="dimmed"
            onClick={handleDownloadSelected}
            disabled={!hasSelection}
            radius="sm"
          >
            <DownloadIcon style={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </div>
  );
};

export default FileActions;
