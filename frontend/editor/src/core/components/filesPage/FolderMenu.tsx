import React, { useState } from "react";
import { Icon } from "@app/ui/Icon";
import { Menu } from "@mantine/core";
import { useTranslation } from "react-i18next";

import { FolderRecord } from "@app/types/folder";
import { ProcessingFolderState } from "@app/hooks/useProcessingFolders";
import { FolderAppearanceModal } from "@app/components/filesPage/FolderAppearanceModal";
import { ProcessingMenuItems } from "@app/components/filesPage/ProcessingMenuItems";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";

interface FolderMenuProps {
  folder: FolderRecord;
  processing: ProcessingFolderState | undefined;
  /** Arrival-driven engine with no explicit retry-failed action. */
  continuous: boolean;
  /** Disk-owned folders cannot be renamed, recoloured or deleted here. */
  isMount: boolean;
  /** Mount roots can be unmounted; a subdirectory below one cannot. */
  canUnmount: boolean;
  editsDisabled: boolean;
  editsDisabledHint?: string;
  /** Disables only processing actions; library edits remain available. */
  processingBlock?: string | null;
  onStartProcessing: () => void;
  onRunProcessing: () => void;
  onStopProcessing: () => void;
  onResumeProcessing: () => void;
  onRemoveProcessing: () => void;
  onEditProcessing: () => void;
  /** Restore every archived original in the folder; absent hides the entry. */
  onRevertAll?: () => void;
  onRename: () => void;
  onChangeAppearance: (appearance: {
    color?: string;
    icon?: string | null;
  }) => void;
  onDelete: () => void;
  /** Adds an Open entry above the rest; absent where the folder is already open. */
  onOpen?: () => void;
  variant?: "toolbar" | "kebab";
  /** Lets a row open its own menu from a right-click anywhere on it. */
  triggerRef?: React.Ref<HTMLButtonElement>;
}

export function FolderMenu({
  folder,
  processing,
  continuous,
  isMount,
  canUnmount,
  editsDisabled,
  editsDisabledHint,
  processingBlock,
  onStartProcessing,
  onRunProcessing,
  onStopProcessing,
  onResumeProcessing,
  onRemoveProcessing,
  onEditProcessing,
  onRevertAll,
  onRename,
  onChangeAppearance,
  onDelete,
  onOpen,
  variant = "toolbar",
  triggerRef,
}: FolderMenuProps) {
  const { t } = useTranslation();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const settingsLabel = t("filesPage.folderSettings", "Folder settings");

  return (
    <>
      <Menu
        shadow="md"
        width={300}
        position={variant === "kebab" ? "bottom-end" : "bottom-start"}
        withinPortal
      >
        <Menu.Target>
          {variant === "kebab" ? (
            <ActionIcon
              ref={triggerRef}
              variant="tertiary"
              size="sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("filesPage.folderMenu", "Folder actions")}
            >
              <Icon name="ellipsis-vertical" size={20} />
            </ActionIcon>
          ) : (
            <Button
              ref={triggerRef}
              size="sm"
              variant="tertiary"
              shape="pill"
              className="files-page-toolbar-bulk-trigger"
              leftSection={<Icon name="settings" size={"1.1rem"} />}
              rightSection={<Icon name="chevron-down" size={"1.1rem"} />}
              aria-label={settingsLabel}
            >
              {settingsLabel}
            </Button>
          )}
        </Menu.Target>
        <Menu.Dropdown>
          {onOpen && (
            <Menu.Item
              leftSection={<Icon name="external-link" size={"1.1rem"} />}
              onClick={onOpen}
            >
              {t("filesPage.open", "Open")}
            </Menu.Item>
          )}
          {!isMount && (
            <>
              <Menu.Label>{t("filesPage.folder", "Folder")}</Menu.Label>
              <Menu.Item
                leftSection={<Icon name="file-pen" size={"1.1rem"} />}
                onClick={onRename}
                disabled={editsDisabled}
                title={editsDisabled ? editsDisabledHint : undefined}
              >
                {t("filesPage.rename", "Rename")}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="palette" size={"1.1rem"} />}
                onClick={() => setAppearanceOpen(true)}
                disabled={editsDisabled}
                title={editsDisabled ? editsDisabledHint : undefined}
              >
                {t("filesPage.appearance.edit", "Appearance…")}
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          <ProcessingMenuItems
            processing={processing}
            continuous={continuous}
            disabled={editsDisabled || Boolean(processingBlock)}
            disabledHint={processingBlock ?? editsDisabledHint}
            onRun={onRunProcessing}
            onStop={onStopProcessing}
            onStart={onStartProcessing}
            onResume={onResumeProcessing}
            onEdit={onEditProcessing}
            onRemove={onRemoveProcessing}
            onRevertAll={onRevertAll}
          />
          {(!isMount || canUnmount) && (
            <>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<Icon name="trash" size={"1.1rem"} />}
                onClick={onDelete}
                disabled={editsDisabled}
                title={editsDisabled ? editsDisabledHint : undefined}
              >
                {isMount
                  ? t("filesPage.removeLocalFolder", "Unmount from Stirling")
                  : t("filesPage.deleteFolder", "Delete folder")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      <FolderAppearanceModal
        folder={appearanceOpen ? folder : null}
        onClose={() => setAppearanceOpen(false)}
        onChange={onChangeAppearance}
        disabled={editsDisabled}
      />
    </>
  );
}

export default FolderMenu;
