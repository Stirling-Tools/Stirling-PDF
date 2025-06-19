import React from "react";
import { Card, Group, Text, Button, Progress } from "@mantine/core";
import { useTranslation } from "react-i18next";
import StorageIcon from "@mui/icons-material/Storage";
import DeleteIcon from "@mui/icons-material/Delete";
import { StorageStats } from "../../services/fileStorage";
import { formatFileSize } from "../../utils/fileUtils";
import { getStorageUsagePercent } from "../../utils/storageUtils";

interface StorageStatsCardProps {
  storageStats: StorageStats | null;
  filesCount: number;
  onClearAll: () => void;
  onReloadFiles: () => void;
}

const StorageStatsCard = ({
  storageStats,
  filesCount,
  onClearAll,
  onReloadFiles,
}: StorageStatsCardProps) => {
  const { t } = useTranslation();

  if (!storageStats) return null;

  const storageUsagePercent = getStorageUsagePercent(storageStats);

  return (
    <Card withBorder p="sm" mb="md" style={{ width: "90%", maxWidth: 600 }}>
      <Group align="center" gap="md">
        <StorageIcon />
        <div style={{ flex: 1 }}>
          <Text size="sm" fw={500}>
            {t("fileManager.storage", "Storage")}: {formatFileSize(storageStats.used)}
            {storageStats.quota && ` / ${formatFileSize(storageStats.quota)}`}
          </Text>
          {storageStats.quota && (
            <Progress
              value={storageUsagePercent}
              color={storageUsagePercent > 80 ? "red" : storageUsagePercent > 60 ? "yellow" : "blue"}
              size="sm"
              mt={4}
            />
          )}
          <Text size="xs" c="dimmed">
            {storageStats.fileCount} {t("fileManager.filesStored", "files stored")}
          </Text>
        </div>
        <Group gap="xs">
          {filesCount > 0 && (
            <Button
              variant="light"
              color="red"
              size="xs"
              onClick={onClearAll}
              leftSection={<DeleteIcon style={{ fontSize: 16 }} />}
            >
              {t("fileManager.clearAll", "Clear All")}
            </Button>
          )}
          <Button
            variant="light"
            color="blue"
            size="xs"
            onClick={onReloadFiles}
          >
            Reload Files
          </Button>
        </Group>
      </Group>
    </Card>
  );
};

export default StorageStatsCard;