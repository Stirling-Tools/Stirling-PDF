import React, { useEffect } from "react";
import { Group, Text, Tooltip } from "@mantine/core";
import { ActionIcon } from "@shared/components/ActionIcon";
import { SegmentedControl } from "@shared/components/SegmentedControl";
import SelectAllIcon from "@mui/icons-material/SelectAll";
import DeleteIcon from "@mui/icons-material/Delete";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import LinkIcon from "@mui/icons-material/Link";
import { useTranslation } from "react-i18next";
import { useFileManagerContext } from "@app/contexts/FileManagerContext";
import { useFileActionTerminology } from "@app/hooks/useFileActionTerminology";
import { useFileActionIcons } from "@app/hooks/useFileActionIcons";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import BulkUploadToServerModal from "@app/components/shared/BulkUploadToServerModal";
import BulkShareModal from "@app/components/shared/BulkShareModal";

const FileActions: React.FC = () => {
  const { t } = useTranslation();
  const terminology = useFileActionTerminology();
  const icons = useFileActionIcons();
  const DownloadIcon = icons.download;
  const { config } = useAppConfig();
  const [showBulkUploadModal, setShowBulkUploadModal] = React.useState(false);
  const [showBulkShareModal, setShowBulkShareModal] = React.useState(false);
  const {
    recentFiles,
    selectedFileIds,
    selectedFiles,
    filteredFiles,
    onSelectAll,
    onDeleteSelected,
    onDownloadSelected,
    refreshRecentFiles,
    storageFilter,
    onStorageFilterChange,
  } = useFileManagerContext();
  const uploadEnabled = config?.storageEnabled === true;
  const sharingEnabled =
    uploadEnabled && config?.storageSharingEnabled === true;
  const shareLinksEnabled =
    sharingEnabled && config?.storageShareLinksEnabled === true;
  const showStorageFilter = uploadEnabled;
  const storageFilterOptions = sharingEnabled
    ? [
        { value: "all", label: t("fileManager.filterAll", "All") },
        { value: "local", label: t("fileManager.filterLocal", "Local") },
        {
          value: "sharedWithMe",
          label: t("fileManager.filterSharedWithMe", "Shared with me"),
        },
        {
          value: "sharedByMe",
          label: t("fileManager.filterSharedByMe", "Shared by me"),
        },
      ]
    : [
        { value: "all", label: t("fileManager.filterAll", "All") },
        { value: "local", label: t("fileManager.filterLocal", "Local") },
      ];
  useEffect(() => {
    if (
      !sharingEnabled &&
      (storageFilter === "sharedWithMe" || storageFilter === "sharedByMe")
    ) {
      onStorageFilterChange("all");
    }
  }, [sharingEnabled, storageFilter, onStorageFilterChange]);
  const hasSelection = selectedFileIds.length > 0;
  const hasOnlyOwnedSelection = selectedFiles.every(
    (file) => file.remoteOwnedByCurrentUser !== false,
  );
  const hasDownloadAccess = selectedFiles.every((file) => {
    const role = (
      file.remoteOwnedByCurrentUser !== false
        ? "editor"
        : (file.remoteAccessRole ?? "viewer")
    ).toLowerCase();
    return role === "editor" || role === "commenter" || role === "viewer";
  });
  const canBulkUpload = uploadEnabled && hasSelection && hasOnlyOwnedSelection;
  const canBulkShare =
    shareLinksEnabled && hasSelection && hasOnlyOwnedSelection;

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

  const allFilesSelected =
    filteredFiles.length > 0 && selectedFileIds.length === filteredFiles.length;

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
      {/* Left: Select All + Filter */}
      <Group gap="xs">
        <Tooltip
          label={
            allFilesSelected
              ? t("fileManager.deselectAll", "Deselect All")
              : t("fileManager.selectAll", "Select All")
          }
        >
          <ActionIcon
            variant="secondary"
            size="sm"
            onClick={handleSelectAll}
            disabled={filteredFiles.length === 0}
            aria-label={
              allFilesSelected
                ? t("fileManager.deselectAll", "Deselect All")
                : t("fileManager.selectAll", "Select All")
            }
          >
            <SelectAllIcon style={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>
        {showStorageFilter && (
          <SegmentedControl
            size="sm"
            value={storageFilter}
            onChange={(value) =>
              onStorageFilterChange(
                value as "all" | "local" | "sharedWithMe" | "sharedByMe",
              )
            }
            options={storageFilterOptions}
          />
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
            {t("fileManager.selectedCount", "{{count}} selected", {
              count: selectedFileIds.length,
            })}
          </Text>
        )}
      </div>

      {/* Right: Delete and Download */}
      <Group gap="xs">
        {uploadEnabled && (
          <Tooltip label={t("fileManager.uploadSelected", "Upload Selected")}>
            <ActionIcon
              variant="secondary"
              size="sm"
              onClick={() => setShowBulkUploadModal(true)}
              disabled={!canBulkUpload}
              aria-label={t("fileManager.uploadSelected", "Upload Selected")}
            >
              <CloudUploadIcon style={{ fontSize: "1rem" }} />
            </ActionIcon>
          </Tooltip>
        )}
        {shareLinksEnabled && (
          <Tooltip label={t("fileManager.shareSelected", "Share Selected")}>
            <ActionIcon
              variant="secondary"
              size="sm"
              onClick={() => setShowBulkShareModal(true)}
              disabled={!canBulkShare}
              aria-label={t("fileManager.shareSelected", "Share Selected")}
            >
              <LinkIcon style={{ fontSize: "1rem" }} />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label={t("fileManager.deleteSelected", "Delete Selected")}>
          <ActionIcon
            variant="secondary"
            size="sm"
            accent="danger"
            onClick={handleDeleteSelected}
            disabled={!hasSelection}
            aria-label={t("fileManager.deleteSelected", "Delete Selected")}
          >
            <DeleteIcon style={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={terminology.downloadSelected}>
          <ActionIcon
            variant="secondary"
            size="sm"
            onClick={handleDownloadSelected}
            disabled={!hasSelection || !hasDownloadAccess}
            aria-label={terminology.downloadSelected}
          >
            <DownloadIcon style={{ fontSize: "1rem" }} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {uploadEnabled && (
        <BulkUploadToServerModal
          opened={showBulkUploadModal}
          onClose={() => setShowBulkUploadModal(false)}
          files={selectedFiles}
          onUploaded={refreshRecentFiles}
        />
      )}
      {shareLinksEnabled && (
        <BulkShareModal
          opened={showBulkShareModal}
          onClose={() => setShowBulkShareModal(false)}
          files={selectedFiles}
          onShared={refreshRecentFiles}
        />
      )}
    </div>
  );
};

export default FileActions;
