import { useState } from "react";
import { Box, Button, Text, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import AddIcon from "@mui/icons-material/Add";
import { useWatchedFolders } from "@app/hooks/useWatchedFolders";
import { useFolderRunStatuses } from "@app/hooks/useFolderRunStatuses";
import { useToolWorkflow } from "@app/contexts/ToolWorkflowContext";
import { useNavigationActions } from "@app/contexts/NavigationContext";
import { WatchedFolderManagementModal } from "@app/components/watchedFolders/WatchedFolderManagementModal";
import { DeleteFolderConfirmModal } from "@app/components/watchedFolders/DeleteFolderConfirmModal";
import { WatchedFolderCard } from "@app/components/watchedFolders/WatchedFolderCard";
import { WatchedFolder } from "@app/types/watchedFolders";
import { AutomationConfig } from "@app/types/automation";
import { automationStorage } from "@app/services/automationStorage";
import {
  WATCHED_FOLDER_VIEW_ID,
  WATCHED_FOLDER_WORKBENCH_ID,
} from "@app/components/watchedFolders/WatchedFoldersRegistration";
export function WatchedFolderSection() {
  const { t } = useTranslation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editFolder, setEditFolder] = useState<WatchedFolder | null>(null);
  const [editAutomation, setEditAutomation] = useState<AutomationConfig | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<WatchedFolder | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const { folders, loading, deleteFolder, refreshFolders } =
    useWatchedFolders();
  const statuses = useFolderRunStatuses(folders);
  const { setCustomWorkbenchViewData } = useToolWorkflow();
  const { actions } = useNavigationActions();
  const handleFolderClick = (folderId: string) => {
    setActiveFolderId(folderId);
    setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, { folderId });
    actions.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);
  };
  const handleEditFolder = async (
    e: React.MouseEvent,
    folder: WatchedFolder,
  ) => {
    e.stopPropagation();
    setEditFolder(folder);
    const automation = await automationStorage.getAutomation(
      folder.automationId,
    );
    setEditAutomation(automation);
    setCreateModalOpen(true);
  };
  const handleDeleteClick = (e: React.MouseEvent, folder: WatchedFolder) => {
    e.stopPropagation();
    setDeleteTarget(folder);
  };
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (activeFolderId === deleteTarget.id) {
      setActiveFolderId(null);
      actions.setWorkbench("fileEditor");
    }
    await deleteFolder(deleteTarget.id);
    setDeleteTarget(null);
  };
  const handleModalClose = () => {
    setCreateModalOpen(false);
    setEditFolder(null);
    setEditAutomation(null);
  };
  return (
    <Box
      style={{
        borderTop: "1px solid var(--border-subtle)",
        backgroundColor: "var(--bg-toolbar)",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Box px="sm" pt="xs" pb="2px" style={{ flexShrink: 0 }}>
        <Box className="tool-subcategory-row">
          <Text
            className="tool-subcategory-row-title"
            style={{ cursor: "pointer" }}
            onClick={() => {
              setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, {
                folderId: null,
              });
              actions.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);
            }}
          >
            {t("watchedFolders.title", "Watched Folders")}
          </Text>
          <Box className="tool-subcategory-row-rule" />
        </Box>
      </Box>
      <Box className="tool-picker-scrollable" style={{ flex: 1, minHeight: 0 }}>
        <Stack gap={0} pb="xs">
          {!loading && folders.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="sm" px="sm">
              {t("watchedFolders.noFolders", "No watch folders yet")}
            </Text>
          )}
          {folders.map((folder) => (
            <WatchedFolderCard
              key={folder.id}
              folder={folder}
              isActive={activeFolderId === folder.id}
              status={statuses[folder.id] ?? "idle"}
              onSelect={() => handleFolderClick(folder.id)}
              onEdit={(e) => handleEditFolder(e, folder)}
              onDelete={(e) => handleDeleteClick(e, folder)}
              onFileDrop={(fileIds) => {
                setCustomWorkbenchViewData(WATCHED_FOLDER_VIEW_ID, {
                  folderId: folder.id,
                  pendingFileIds: fileIds,
                });
                actions.setWorkbench(WATCHED_FOLDER_WORKBENCH_ID);
                setActiveFolderId(folder.id);
              }}
            />
          ))}
          <Button
            variant="subtle"
            className="tool-button"
            fullWidth
            justify="flex-start"
            px="sm"
            leftSection={
              <AddIcon
                style={{ fontSize: 14, color: "var(--mantine-color-gray-5)" }}
              />
            }
            onClick={() => setCreateModalOpen(true)}
          >
            <Text size="sm" c="dimmed">
              {t("watchedFolders.newFolder", "New folder")}
            </Text>
          </Button>
        </Stack>
      </Box>
      <WatchedFolderManagementModal
        opened={createModalOpen}
        editFolder={editFolder}
        existingAutomation={editAutomation}
        onClose={handleModalClose}
        onSaved={refreshFolders}
      />
      <DeleteFolderConfirmModal
        opened={!!deleteTarget}
        folder={deleteTarget}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
