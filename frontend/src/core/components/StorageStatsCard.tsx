import React from "react";
import { Card, Group, Text, Button, Progress } from "@mantine/core";
import { useTranslation } from "react-i18next";
import LocalIcon from "@app/components/shared/LocalIcon";
import { StorageStats } from "@app/services/fileStorage";
import { formatFileSize } from "@app/utils/fileUtils";
import { getStorageUsagePercent } from "@app/utils/storageUtils";

interface StorageStatsCardProps {
  storageStats: StorageStats | null;
  filesCount: number;
  onClearAll: () => void;
  onReloadFiles: () => void;
}

const StorageStatsCard: React.FC<StorageStatsCardProps> = ({
  storageStats,
  filesCount,
  onClearAll,
  onReloadFiles,
}) => {
  const { t } = useTranslation();

  if (!storageStats) return null;

  const storageUsagePercent = getStorageUsagePercent(storageStats);

  return (
    <Card withBorder p="sm" mb="md" style={{ width: "90%", maxWidth: 600 }}>
      <Group align="center" gap="md">
        <LocalIcon icon="storage-rounded" width={24} height={24} />
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
              leftSection={<LocalIcon icon="delete-rounded" width={16} height={16} />}
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