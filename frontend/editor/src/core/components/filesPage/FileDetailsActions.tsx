import { Menu, Tooltip } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Icon } from "@app/ui/Icon";
import { FileId } from "@app/types/file";
import { StirlingFileStub } from "@app/types/fileContext";

export interface FileDetailsActionsProps {
  selectedFileIds: FileId[];
  /** The only selected file, or null for a multi-selection. */
  single: StirlingFileStub | null;
  fileCount: number;
  /** Selected files with no server copy yet; empty hides Save to server. */
  localOnlyFiles: StirlingFileStub[];
  sharingEnabled: boolean;
  downloading: boolean;
  onDownload: () => void;
  onAddToWorkspace: (fileIds: FileId[]) => void;
  onMove: (fileIds: FileId[]) => void;
  onRemove: (fileIds: FileId[]) => void;
  onSaveToServer?: (files: StirlingFileStub[]) => void;
  /** When set, Save to server renders disabled with this tooltip (storage off). */
  saveToServerDisabledReason?: string | null;
  onShare: () => void;
}

const ICON_SIZE = 20;
const MENU_ICON_SIZE = "1.1rem";

/**
 * The details panel's action row: one primary CTA, download, and everything
 * else behind an overflow menu.
 */
export function FileDetailsActions({
  selectedFileIds,
  single,
  fileCount,
  localOnlyFiles,
  sharingEnabled,
  downloading,
  onDownload,
  onAddToWorkspace,
  onMove,
  onRemove,
  onSaveToServer,
  saveToServerDisabledReason,
  onShare,
}: FileDetailsActionsProps) {
  const { t } = useTranslation();

  const addLabel =
    fileCount === 1
      ? t("filesPage.addToWorkspace", "Add to workspace")
      : t("filesPage.addToWorkspaceCount", "Add {{count}} to workspace", {
          count: fileCount,
        });
  const downloadLabel = single
    ? t("filesPage.download", "Download")
    : t("filesPage.downloadAll", "Download all");
  const showSaveToServer = Boolean(onSaveToServer) && localOnlyFiles.length > 0;
  const saveToServerDisabled = Boolean(saveToServerDisabledReason);

  return (
    <div className="files-page-details-actions">
      <div className="files-page-details-actions-row">
        <Button
          style={{ flex: 1 }}
          leftSection={<Icon name="external-link" size={ICON_SIZE} />}
          onClick={() => onAddToWorkspace(selectedFileIds)}
        >
          {addLabel}
        </Button>
        <Tooltip label={downloadLabel} withinPortal>
          <ActionIcon
            variant="secondary"
            loading={downloading}
            onClick={onDownload}
            aria-label={downloadLabel}
          >
            <Icon name="download" size={ICON_SIZE} />
          </ActionIcon>
        </Tooltip>
        <Menu shadow="md" width={230} position="top-end" withinPortal>
          <Menu.Target>
            <ActionIcon
              variant="secondary"
              aria-label={t("filesPage.bulkActions", "Actions")}
            >
              <Icon name="ellipsis-vertical" size={ICON_SIZE} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {/* Share is single-file only. When sharing is disabled in server
                config (storage.sharing.enabled=false) the item stays listed but
                disabled, so the feature is discoverable rather than absent. */}
            {single && (
              <Tooltip
                label={t(
                  "filesPage.shareDisabledHint",
                  "File sharing isn't enabled on this server. Ask your admin to enable it.",
                )}
                disabled={sharingEnabled}
                withinPortal
                multiline
                w={260}
              >
                <Menu.Item
                  leftSection={<Icon name="link" size={MENU_ICON_SIZE} />}
                  disabled={!sharingEnabled}
                  onClick={onShare}
                >
                  {t("filesPage.shareManage", "Manage sharing")}
                </Menu.Item>
              </Tooltip>
            )}
            <Menu.Item
              leftSection={<Icon name="folder-input" size={MENU_ICON_SIZE} />}
              onClick={() => onMove(selectedFileIds)}
            >
              {t("filesPage.moveTo", "Move to…")}
            </Menu.Item>
            {showSaveToServer && (
              <Tooltip
                label={saveToServerDisabledReason}
                disabled={!saveToServerDisabled}
                withinPortal
                multiline
                w={260}
              >
                <Menu.Item
                  leftSection={
                    <Icon name="cloud-upload" size={MENU_ICON_SIZE} />
                  }
                  disabled={saveToServerDisabled}
                  onClick={() => onSaveToServer?.(localOnlyFiles)}
                >
                  {t("filesPage.saveToServer", "Save to server")}
                </Menu.Item>
              </Tooltip>
            )}
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<Icon name="trash" size={MENU_ICON_SIZE} />}
              onClick={() => onRemove(selectedFileIds)}
            >
              {t("filesPage.remove", "Delete")}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  );
}
