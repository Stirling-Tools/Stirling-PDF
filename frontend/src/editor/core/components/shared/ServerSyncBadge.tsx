import { Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePreferences } from "@editor/contexts/PreferencesContext";
import {
  type ServerSyncStatus,
  useServerSyncStatus,
} from "@editor/services/serverAutoSync";
import type { StirlingFileStub } from "@editor/types/fileContext";
import { Icon, type IconName } from "@editor/ui/Icon";

const STATUS_ICON: Record<ServerSyncStatus, IconName> = {
  pending: "cloud-upload",
  syncing: "cloud-upload",
  synced: "cloud-check",
  offline: "cloud-off",
  conflict: "triangle-alert",
  error: "circle-alert",
};

interface ServerSyncBadgeProps {
  file: StirlingFileStub;
  className?: string;
}

/**
 * Sync state of a server document while automatic sync is on; nothing otherwise.
 */
export function ServerSyncBadge({ file, className }: ServerSyncBadgeProps) {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const status = useServerSyncStatus(file);
  if (!preferences.autoSyncServerFiles || !status) return null;

  const label = {
    pending: t("serverSync.status.pending", "Changes waiting to sync"),
    syncing: t("serverSync.status.syncing", "Syncing to server"),
    synced: t("serverSync.status.synced", "Up to date on server"),
    offline: t(
      "serverSync.status.offline",
      "Offline: changes will sync when the connection returns",
    ),
    conflict: t(
      "serverSync.status.conflict",
      "Changed on another device: use Update on Server to keep your version",
    ),
    error: t(
      "serverSync.status.error",
      "Sync failed: it will retry after your next edit",
    ),
  }[status];
  return (
    <Tooltip label={label} withArrow>
      <span
        className={className}
        role="img"
        aria-label={label}
        data-sync-status={status}
        data-testid="server-sync-badge"
      >
        <Icon name={STATUS_ICON[status]} size={12} />
      </span>
    </Tooltip>
  );
}
