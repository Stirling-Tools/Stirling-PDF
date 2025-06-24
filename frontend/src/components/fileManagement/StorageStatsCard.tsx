import React from "react";
import { Card, Group, Text, Button, Progress, Alert, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import StorageIcon from "@mui/icons-material/Storage";
import DeleteIcon from "@mui/icons-material/Delete";
import WarningIcon from "@mui/icons-material/Warning";
import { StorageStats } from "../../services/fileStorage";
import { formatFileSize } from "../../utils/fileUtils";
import { getStorageUsagePercent } from "../../utils/storageUtils";
import { StorageConfig } from "../../types/file";

interface StorageStatsCardProps {
  storageStats: StorageStats | null;
  filesCount: number;
  onClearAll: () => void;
  onReloadFiles: () => void;
  storageConfig: StorageConfig;
}

const StorageStatsCard = ({
  storageStats,
  filesCount,
  onClearAll,
  onReloadFiles,
  storageConfig,
}: StorageStatsCardProps) => {
  const { t } = useTranslation();

  if (!storageStats) return null;

  const storageUsagePercent = getStorageUsagePercent(storageStats);
  const totalUsed = storageStats.totalSize || storageStats.used;
  const hardLimitPercent = (totalUsed / storageConfig.maxTotalStorage) * 100;
  const isNearLimit = hardLimitPercent >= storageConfig.warningThreshold * 100;

  return (
    <Stack gap="sm" style={{ width: "90%", maxWidth: 600 }}>
      <Card withBorder p="sm">
        <Group align="center" gap="md">
          <StorageIcon />
          <div style={{ flex: 1 }}>
            <Text size="sm" fw={500}>
              {t("storage.storageUsed", "Storage used")}: {formatFileSize(totalUsed)} / {formatFileSize(storageConfig.maxTotalStorage)}
            </Text>
            <Progress
              value={hardLimitPercent}
              color={isNearLimit ? "red" : hardLimitPercent > 60 ? "yellow" : "blue"}
              size="sm"
              mt={4}
            />
            <Group justify="space-between" mt={2}>
              <Text size="xs" c="dimmed">
                {storageStats.fileCount} files • {t("storage.approximateSize", "Approximate size")}
              </Text>
              <Text size="xs" c={isNearLimit ? "red" : "dimmed"}>
                {Math.round(hardLimitPercent)}% used
              </Text>
            </Group>
            {isNearLimit && (
              <Text size="xs" c="red" mt={4}>
                {t("storage.storageFull", "Storage is nearly full. Consider removing some files.")}
              </Text>
            )}
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
              {t("fileManager.reloadFiles", "Reload Files")}
            </Button>
          </Group>
        </Group>
      </Card>
    </Stack>
  );
};

export default StorageStatsCard;
